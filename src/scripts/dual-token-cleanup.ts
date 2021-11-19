import { Account } from '../explorer-db/entity/account'
import { AssetMovement } from '../explorer-db/entity/movement'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType, AssetType, CountType } from '../explorer-db/types'
import { In, createConnection, getConnectionOptions } from 'typeorm'
import { Counts } from '../explorer-db/entity/counts'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))

    await conn.getRepository(Account).clear()
    await conn.getRepository(AssetMovement).delete({ asset: In([AssetType.VET, AssetType.VTHO]) })
    await conn.getRepository(Counts).delete({type: In([CountType.Transfer + AssetType.VET, CountType.Transfer+AssetType.VTHO])})
    await conn.getRepository(Snapshot).delete({type: SnapType.DualToken})
    await conn.getRepository(Config).delete({ key: 'dual-token-head'})
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
})
