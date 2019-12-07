import { LessThanOrEqual, createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { Persist } from '../../processor/master-node/persist'
import { AuthorityAddress, authority } from '../../const'
import { Authority } from '../../explorer-db/entity/authority'
import { Block } from '../../explorer-db/entity/block'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'

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

    const {head, nodes} = await new Promise((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const n = await manager
                .getRepository(Authority)
                .find()
            resolve({head: h, nodes: n})
        }).catch(reject)
    })

    console.log('start checking...')
    let count = 0
    let listed = 0
    for (const node of nodes) {
        const chain = await get(node.address, head.toString())
        if (chain.listed !== node.listed) {
            throw new Error(`Fatal: Master(${node.address}) listed status mismatch, want ${node.listed} got ${chain.listed}`)
        }
        if (chain.listed) {
            listed++
        }
        const signed = await conn
            .getRepository(Block)
            .count({ signer: node.address, isTrunk: true, number: LessThanOrEqual(head) })

        if (node.signed !== signed) {
            throw new Error(`Fatal: Master(${node.address} signed block count mismatch, want ${node.signed} got ${signed}`)
        }

        count++
        if (count % 10 === 0) {
            console.log('checked ', count)
        }
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
