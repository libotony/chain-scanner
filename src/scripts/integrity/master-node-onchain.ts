import { createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { Persist } from '../../processor/master-node/persist'
import { Authority } from '../../explorer-db/entity/authority'
import { Block } from '../../explorer-db/entity/block'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'
import { getBlockByNumber } from '../../service/block'

const net = getNetwork()
const chainNodes = new Map<string, {signed: number, reward: bigint}>()
const thor = new Thor(new Net(getThorREST()), net)
const persist = new Persist()

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

    for (const n of nodes) {
        chainNodes.set(n.address, {signed: 0, reward: BigInt(0)})
    }

    let curr = (await thor.getBlock(block.id, 'regular'))!
    for (let i = block.number; i >= 1; i--) {
        const currNode = chainNodes.get(curr.signer)!
        currNode.signed += 1
        for (const tx of curr.transactions) {
            const r = await thor.getReceipt(tx, curr.id)
            currNode.reward += BigInt(r.reward)
        }

        curr = (await thor.getBlock(curr.parentID, 'regular'))!
        if (i % 5000 === 0) {
            console.log('processed', i)
        }
    }

    for (const n of nodes) {
        const currNode = chainNodes.get(n.address)!
        if (currNode.reward !== n.reward) {
            console.log(`Fatal: Master(${n.address} block reward mismatch, chain ${currNode.reward} db ${n.reward}`)
        }

        if (currNode.signed !== n.signed) {
            console.log(`Fatal: Master(${n.address} signed block count mismatch, chai ${currNode.signed} db ${n.signed}`)
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
