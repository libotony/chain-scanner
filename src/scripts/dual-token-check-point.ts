import { initConnection } from '../db'
import { Account } from '../db/entity/account'
import { AssetMovement } from '../db/entity/movement'
import { Config } from '../db/entity/config'
import { Snapshot } from '../db/entity/snapshot'
import { SnapType, AssetType } from '../types'
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
