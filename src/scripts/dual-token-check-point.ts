import { Account } from '../explorer-db/entity/account'
import { AssetMovement } from '../explorer-db/entity/movement'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType, AssetType } from '../explorer-db/types'
import { In, createConnection, getConnectionOptions } from 'typeorm'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))

    await conn.getRepository(Account).clear()
    await conn.getRepository(AssetMovement).delete({type: In([AssetType.VET, AssetType.VTHO])})
    await conn.getRepository(Snapshot).delete({type: SnapType.DualToken})
    await conn.getRepository(Config).delete({ key: 'dual-token-head'})
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
})
