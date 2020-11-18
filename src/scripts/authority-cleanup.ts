import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType } from '../explorer-db/types'
import { createConnection, getConnectionOptions } from 'typeorm'
import { Authority } from '../explorer-db/entity/authority'
import { AuthorityEvent } from '../explorer-db/entity/authority-event'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))

    await conn.getRepository(Authority).clear()
    await conn.getRepository(AuthorityEvent).clear()
    await conn.getRepository(Snapshot).delete({type: SnapType.Authority})
    await conn.getRepository(Config).delete({ key: 'authority-head'})
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
})
