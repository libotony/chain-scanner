import { createConnection, getManager, Transaction, LessThanOrEqual, getConnection, In } from 'typeorm'
import { Persist } from '../../processor/dual-token/persist'
import { Thor } from '../../thor-rest'
import { Account } from '../../explorer-db/entity/account'
import { PrototypeAddress, ZeroAddress, prototype, ParamsAddress, AuthorityAddress, EnergyAddress, ExecutorAddress, ExtensionAddress } from '../../const'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'
import { getBlockByNumber } from '../../service/block'
import { Block } from '../../explorer-db/entity/block'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { AggregatedMovement } from '../../explorer-db/entity/aggregated-move'
import { MoveType } from '../../explorer-db/types'

const net = getNetwork()
const persist = new Persist()

/*
export const ParamsAddress = '0x' + Buffer.from('Params').toString('hex').padStart(40, '0')
export const AuthorityAddress = '0x' + Buffer.from('Authority').toString('hex').padStart(40, '0')
export const EnergyAddress = '0x' + Buffer.from('Energy').toString('hex').padStart(40, '0')
export const ExecutorAddress = '0x' + Buffer.from('Executor').toString('hex').padStart(40, '0')
export const PrototypeAddress = '0x' + Buffer.from('Prototype').toString('hex').padStart(40, '0')
export const ExtensionAddres
 */

const skipFirstSeen = [ParamsAddress, AuthorityAddress, EnergyAddress, ExecutorAddress, PrototypeAddress, ExtensionAddress]
// precompiled contracts
for (let i = 1; i <= 9; i++){
    skipFirstSeen.push('0x'+Buffer.alloc(1).fill(i).toString('hex').padStart(40, '0'))
}

createConnection().then(async (conn) => {
    const thor = new Thor(new Net(getThorREST()), net)
    await checkNetworkWithDB(net)

    const { block, accounts } = await new Promise<{
        block: Block,
        accounts: Account[]
    }>((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const b = (await getBlockByNumber(h))!
            const accs = await manager
                .getRepository(Account)
                .find()
            resolve({block: b, accounts: accs})
        }).catch(reject)
    })
    const head =  block.id

    let count = 0
    console.log('start checking...')
    for (const acc of accounts) {
        let chainAcc: Connex.Thor.Account
        let chainCode: Connex.Thor.Code
        let chainMaster: string | null = null
        let chainSponsor: string | null = null
        try {
            chainAcc = await thor.getAccount(acc.address, head)
            chainCode = await thor.getCode(acc.address, head)
            let ret = await thor.explain({
                clauses: [{
                    to: PrototypeAddress,
                    value: '0x0',
                    data: prototype.master.encode(acc.address)
                }]
            }, head)
            let decoded = prototype.master.decode(ret[0].data)
            if (decoded['0'] !== ZeroAddress) {
                chainMaster = decoded['0']
            }

            ret = await thor.explain({
                clauses: [{
                    to: PrototypeAddress,
                    value: '0x0',
                    data: prototype.currentSponsor.encode(acc.address)
                }]
            }, head)
            decoded = prototype.currentSponsor.decode(ret[0].data)
            const sponsor = decoded['0']
            if (sponsor !== ZeroAddress) {
                ret = await thor.explain({
                    clauses: [{
                        to: PrototypeAddress,
                        value: '0x0',
                        data: prototype.isSponsor.encode(acc.address, sponsor)
                    }]
                }, head)
                decoded = prototype.isSponsor.decode(ret[0].data)
                if (decoded['0'] === true) {
                    chainSponsor = sponsor
                }
            }
        } catch {
            continue
        }

        if (acc.balance !== BigInt(chainAcc.balance)) {
            throw new Error(`Fatal: balance mismatch of Account(${acc.address}) chain:${chainAcc.balance} db:${acc.balance}`)
        }
        if (acc.blockTime < block.timestamp) {
            acc.energy =
                acc.energy
                + BigInt(5000000000) * acc.balance * BigInt(block.timestamp - acc.blockTime)
                / BigInt(1e18)
        }
        if (acc.energy !== BigInt(chainAcc.energy)) {
            throw new Error(`Fatal: energy mismatch of Account(${acc.address}) chain:${chainAcc.energy} db:${acc.energy}`)
        }
        if (acc.master !== chainMaster) {
            throw new Error(`Fatal: master of Account(${acc.address}) mismatch,chain:${chainMaster} db:${acc.master}`)
        }
        if (acc.sponsor !== chainSponsor) {
            // tslint:disable-next-line: max-line-length
            throw new Error(`Fatal: sponsor of Account(${acc.address}) mismatch,chain:${chainSponsor} db:${acc.sponsor}`)
        }
        if (chainAcc.hasCode === true && acc.code !== chainCode.code) {
            throw new Error(`Fatal: Account(${acc.address}) code mismatch`)
        }
        if (chainAcc.hasCode === false && acc.code!==null) {
            throw new Error(`Fatal: Account(${acc.address}) hasCode status mismatch`)
        }

        const isSuicided = (acc: Connex.Thor.Account): boolean => {
            return (BigInt(acc.balance) == BigInt(0) && BigInt(acc.energy) == BigInt(0) && acc.hasCode == false)   
        }

        if (acc.suicided) {
            if (isSuicided(chainAcc) !== true){
                throw new Error(`Fatal: Account(${acc.address}) suicided status mismatch`)
            }
        }

        if (skipFirstSeen.indexOf(acc.address) === -1) {
            const evs  = await thor.filterEventLogs({
                range: {unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
                options: {offset: 0, limit: 1},
                criteriaSet: [{address: acc.address, topic0: prototype.$Master.signature}],
                order: 'asc'
            })
    
            const trs = await thor.filterTransferLogs({
                range: {unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
                options: {offset: 0, limit: 1},
                criteriaSet: [{sender: acc.address}, {recipient: acc.address}],
                order: 'asc'
            })
    
            if (evs.length === 0 && trs.length === 0) {
                throw new Error(`Fatal: Account(${acc.address}) can not find the first seen time`)
            }

            const firstSeen = evs[0].meta!.blockTimestamp < trs[0].meta!.blockTimestamp ? evs[0].meta!.blockTimestamp : trs[0].meta!.blockTimestamp
            if (firstSeen !== acc.firstSeen){
                throw new Error(`Fatal: Account(${acc.address}) first seen mismatch`)
            }

            if (acc.code != null && acc.deployer !== evs[0].meta?.txOrigin) {
                throw new Error(`Fatal: Account(${acc.address}) deployer mismatch`)
            }
        }

        count++
        if (count % 1000 === 0) {
            console.log('checked ', count)
        }
    }
    console.log('checking aggregated movements....')

    await conn.manager.transaction('SERIALIZABLE', async manager => {
        const c1 = await getConnection()
        .getRepository(AssetMovement)
        .count()
        const c2 = await getConnection()
            .getRepository(AggregatedMovement)
            .count({
                type: In([MoveType.In, MoveType.Self])
            })
        if (c1 !== c2) {
            throw new Error(`Fatal: aggregated movements mismatch, origin (${c1}) got aggregated:${c2}`)
        }
    })
    console.log('all done!')
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})
