import { LessThanOrEqual, createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { Persist } from '../../processor/master-node/persist'
import { AuthorityAddress, authority } from '../../const'
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
    return { master, listed: getRet.listed, endorsor: getRet.endorsor, identity: getRet.identity }
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
    let listed = 0
    for (const node of nodes) {
        const chain = await get(node.address, head)
        if (chain.listed !== node.listed) {
            throw new Error(`Fatal: Master(${node.address}) listed status mismatch, want ${node.listed} got ${chain.listed}`)
        }
        if (chain.listed) {
            listed++
        }

        const { blocks } = await new Promise<{
            blocks: Block[],
        }>((resolve, reject) => {
            conn.manager.transaction('SERIALIZABLE', async manager => {
                const h = (await persist.getHead(manager))!
                const blocks = await manager
                    .getRepository(Block)
                    .find({ signer: node.address, isTrunk: true, number: LessThanOrEqual(h) })
                resolve({blocks})
            }).catch(reject)
        })

        const reward = blocks.reduce((acc, b) => {
            return acc + b.reward
        }, BigInt(0))

        if (reward !== node.reward) {
            throw new Error(`Fatal: Master(${node.address} block reward mismatch, want ${node.reward} got ${reward}`)
        }

        if (node.signed !== blocks.length) {
            throw new Error(`Fatal: Master(${node.address} signed block count mismatch, want ${node.signed} got ${blocks.length}`)
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
