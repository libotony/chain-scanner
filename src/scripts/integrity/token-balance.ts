import { createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { balanceOf } from '../../const'
import { TokenBalance } from '../../explorer-db/entity/token-balance'
import { CountType } from '../../explorer-db/types'
import { Persist } from '../../processor/vip180/persist'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { blockIDtoNum, getThorREST } from '../../utils'
import { getBlockByNumber } from '../../service/block'
import { Block } from '../../explorer-db/entity/block'
import { Counts } from '../../explorer-db/entity/counts'
import { AggregatedMovement } from '../../explorer-db/entity/aggregated-move'
import { getVIP180Token } from '../../token-list'
import { AssetType } from '../../types'

const net = getNetwork()
const thor = new Thor(new Net(getThorREST()), net)
const token = getVIP180Token(thor.genesisID, process.argv[3] || 'OCE')
const persist = new Persist(token)
const assetType = AssetType[token.symbol as keyof typeof AssetType]
const countsType = CountType.Transfer + assetType

createConnection().then(async (conn) => {
    await checkNetworkWithDB(net)
    const { block, accounts } = await new Promise<{
        block: Block,
        accounts: TokenBalance[]
    }>((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const accs = await manager
                .getRepository(TokenBalance)
                .find({
                    where: { type:  assetType}
                })
            const b = (await getBlockByNumber(h))!
            resolve({block: b, accounts: accs})
        }).catch(reject)
    })
    let count = 0

    const head = block.id
    console.log('start checking...')
    for (const acc of accounts) {
        let chainBalance: bigint
        try {
            const ret = await thor.explain({
                clauses: [{
                    to:  token.address,
                    value: '0x0',
                    data: balanceOf.encode(acc.address)
                }]
            }, head)
            const decoded = balanceOf.decode(ret[0].data)

            chainBalance = BigInt(decoded.balance)
        } catch {
            continue
        }
        if (acc.balance !== chainBalance) {
            throw new Error(`Fatal: ${token.symbol} balance mismatch of Account(${acc.address}), want ${chainBalance} got ${acc.balance}`)
        }

        if (count % 100 === 0) {
            const h = (await persist.getHead(conn.manager))!
            if (h !== blockIDtoNum(head)) {
                throw new Error('head is moving, the job might be still running, exit!')
            }
        }

        const counts = await conn.manager
            .getRepository(Counts)
            .findOne({ address: acc.address, type: countsType })
    
        if (!counts) {
            throw new Error(`Fatal: can not find ${token.symbol} counts of Account(${acc.address})`)
        }
        
        const wanted = await conn.manager
            .getRepository(AggregatedMovement)
            .count({participant: acc.address, asset: assetType})

        const actual = counts.in + counts.out + counts.self
        
        if (wanted !== actual) {
            throw new Error(`Fatal: ${token.symbol} counts mismatch of Account(${acc.address}), want ${wanted} got ${actual}`)
        }

        count++
        if (count % 1000 === 0) {
            console.log('checked ', count)
        }
    }
    console.log('all done!')

}).then(() => {
    process.exit(0)
}).catch(e => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})
