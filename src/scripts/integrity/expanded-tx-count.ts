import { createConnection } from 'typeorm'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getBlockByNumber } from '../../service/block'
import { Block } from '../../explorer-db/entity/block'
import { CountType, MoveType } from '../../explorer-db/types'
import { Counts } from '../../explorer-db/entity/counts'
import { Persist } from '../../processor/tx-indexer/persist'
import { AggregatedTransaction } from '../../explorer-db/entity/aggregated-tx'

const net = getNetwork()
const persist = new Persist()

createConnection().then(async (conn) => {
    await checkNetworkWithDB(net)

    const { block, cnts } = await new Promise<{
        block: Block,
        cnts: Counts[]
    }>((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const b = (await getBlockByNumber(h, manager))!
            const cnts = await manager
                .getRepository(Counts)
                .find({ type: CountType.TX })
            resolve({ block: b, cnts: cnts })
        }).catch(reject)
    })
    const head = block.number

    let count = 0
    console.log('start checking...')
    for (const cnt of cnts) {
        if (count % 100 === 0) {
            const h = (await persist.getHead(conn.manager))!
            if (h !== head) {
                throw new Error('head is moving, the job might be still running, exit!')
            }
        }

        const inCnt = await conn.manager
            .getRepository(AggregatedTransaction)
            .count({
                participant: cnt.address,
                type: MoveType.In
            })
        if (inCnt != cnt.in) {
            throw new Error(`${cnt.address}: tx IN count not match, indexed: ${cnt.in} but got ${inCnt}`)
        }

        const outCnt = await conn.manager
            .getRepository(AggregatedTransaction)
            .count({
                participant: cnt.address,
                type: MoveType.Out
            })
        if (outCnt != cnt.out) {
            throw new Error(`${cnt.address}: tx OUT count not match, indexed: ${cnt.out} but got ${outCnt}`)
        }

        const selfCnt = await conn.manager
            .getRepository(AggregatedTransaction)
            .count({
                participant: cnt.address,
                type: MoveType.Self
            })
        if (outCnt != cnt.out) {
            throw new Error(`${cnt.address}: tx OUT count not match, indexed: ${cnt.self} but got ${selfCnt}`)
        }

        count++
        if (count % 1000 === 0) {
            console.log('checked ', count)
        }
    }
    console.log('all done!')
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})
