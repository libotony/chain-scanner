import { LessThanOrEqual, createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { Persist } from '../../processor/master-node/persist'
import { AuthorityAddress, authority, ParamsAddress, params } from '../../const'
import { Authority } from '../../explorer-db/entity/authority'
import { Block } from '../../explorer-db/entity/block'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'
import { getBlockByNumber } from '../../service/block'

const net = getNetwork()
const thor = new Thor(new Net(getThorREST()), net)
const persist = new Persist()

const get = async (master: string, revision: string) => {
    const ret = await thor.explain({
        clauses: [{
            to:  AuthorityAddress,
            value: '0x0',
            data: authority.get.encode(master)
        }]
    }, revision)
    const getRet = authority.get.decode(ret[0].data)
    return { master, listed: getRet.listed, endorsor: getRet.endorsor, identity: getRet.identity, active: getRet.active }
}

const endorsement = async  (revision: string) => {
    const ret = await thor.explain({
        clauses: [{
            to: ParamsAddress,
            value: '0x0',
            data: params.get.encode(params.keys.proposerEndorsement)
        }]
    }, revision)
    const e = BigInt(params.get.decode(ret[0].data)['0'])
    return e
}

createConnection().then(async (conn) => {
    await checkNetworkWithDB(net)

    const { block, nodes } = await new Promise<{
        block: Block,
        nodes: Authority[]
    }>((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const n = await manager
                .getRepository(Authority)
                .find()
            const b = (await getBlockByNumber(h))!
            resolve({block: b, nodes: n})
        }).catch(reject)
    })

    const head = block.id
    console.log('start checking...')
    const amount = await endorsement(head)
    const isEndorsed = async (endorsor: string) => {
        const acc = await thor.getAccount(endorsor, head)
        return BigInt(acc.balance) >= amount
    }
    let listed = 0
    for (const node of nodes) {
        const chain = await get(node.address, head)

        if (chain.listed !== node.listed) {
            throw new Error(`Fatal: Master(${node.address}) listed status mismatch, want ${node.listed} got ${chain.listed}`)
        }
        if (chain.listed) {
            listed++
            if (chain.active !== node.active) {
                throw new Error(`Fatal: Master(${node.address}) active status mismatch, want ${node.active} got ${chain.active}`)
            }        const endorsed = await isEndorsed(node.endorsor)
            if (endorsed !== node.endorsed) {
                throw new Error(`Fatal: Master(${node.address}) endorsed status mismatch, want ${node.endorsed} got ${endorsed}`)
            }
        }

        let reward = BigInt(0)
        let signed = 0
        const { authNode } = await new Promise<{
            authNode: Authority
        }>((resolve, reject) => {
            conn.manager.transaction('SERIALIZABLE', async manager => {
                const h = (await persist.getHead(manager))!
                const authNode = (await manager
                    .getRepository(Authority)
                    .findOne({ address: node.address }))!

                const stream = await manager
                    .getRepository(Block)
                    .createQueryBuilder()
                    .where({ signer: node.address, isTrunk: true, number: LessThanOrEqual(h) })
                    .stream()

                stream.on('data', (b) => {
                    signed += 1
                    reward += BigInt('0x' + b.Block_reward.toString('hex'))
                })

                stream.on('end', () => {
                    resolve({authNode})
                })

            }).catch(reject)
        })

        if (authNode.reward !== reward) {
            throw new Error(`Fatal: Master(${node.address} block reward mismatch, want ${node.reward} got ${reward}`)
        }

        if (authNode.signed !== signed) {
            throw new Error(`Fatal: Master(${node.address} signed block count mismatch, want ${node.signed} got ${signed}`)
        }

        console.log('checked', node.address)
    }

    console.log(`Total master: ${nodes.length}, inPower: ${listed}`)
    console.log('all done!')

}).then(() => {
    process.exit(0)
}).catch(e => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})
