import { Config } from '../../explorer-db/entity/config'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { SnapType, CountType } from '../../explorer-db/types'
import { createConnection, getConnectionOptions } from 'typeorm'
import { Counts } from '../../explorer-db/entity/counts'
import { AggregatedTransaction } from '../../explorer-db/entity/aggregated-tx'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))

    await conn.getRepository(AggregatedTransaction).clear()
    await conn.getRepository(Counts).delete({type: CountType.TX})
    await conn.getRepository(Snapshot).delete({type: SnapType.ExpandTX})
    await conn.getRepository(Config).delete({ key: 'expand-tx-head'})
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
})
