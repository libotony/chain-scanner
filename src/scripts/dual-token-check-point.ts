import { initConnection } from '../explorer-db'
import { Account } from '../explorer-db/entity/account'
import { AssetMovement } from '../explorer-db/entity/movement'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType, AssetType } from '../explorer-db/types'
import { In } from 'typeorm'

initConnection().then(async (conn) => {
    await conn.getRepository(Account).clear()
    await conn.getRepository(AssetMovement).delete({type: In([AssetType.VET, AssetType.Energy])})
    await conn.getRepository(Snapshot).delete({type: SnapType.DualToken})
    await conn.getRepository(Config).delete({ key: 'dual-token-head'})
}).then(() => {
    process.exit(0)
}).catch(e => {
    console.log(e)
})
