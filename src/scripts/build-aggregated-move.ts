import { getConnection, MoreThan, createConnection, MongoEntityManager } from 'typeorm'
import { AssetMovement } from '../explorer-db/entity/movement'
import { AggregatedMovement } from '../explorer-db/entity/aggregated-move'
import { blockIDtoNum } from '../utils'

createConnection().then(async (conn) => {

    let offset = 0
    const step = 1000
    for (; ;) {
        const transfers = await conn
            .getRepository(AssetMovement)
            .find({
                take: step,
                skip: offset
            })
        if (!transfers.length) {
            console.log('finished')
            break
        }
        for (const tr of transfers) {
            const s = conn.manager.create(AggregatedMovement, {
                participant: tr.sender,
                type: tr.type,
                movementID: tr.id,
                seq: {
                    blockNumber: blockIDtoNum(tr.blockID),
                    moveIndex: tr.moveIndex
                }
            })
            const r = conn.manager.create(AggregatedMovement, {
                participant: tr.recipient,
                type: tr.type,
                movementID: tr.id,
                seq: {
                    blockNumber: blockIDtoNum(tr.blockID),
                    moveIndex: tr.moveIndex
                }
            })

            await conn.manager.insert(AggregatedMovement, [s, r])
        }

        offset += step
        console.log('processed', offset)
    }

    process.exit(0)
}). catch ((e: Error) => {
    console.log('move log: ')
    console.log(e)
    process.exit(1)
})
