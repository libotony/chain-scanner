import { initConnection } from '../db'
import { Account } from '../db/entity/account'
import { Transfer, Energy } from '../db/entity/movement'
import { Config } from '../db/entity/config'
import { Snapshot } from '../db/entity/snapshot'

initConnection().then(async (conn) => {
    await conn.getRepository(Account).clear()
    await conn.getRepository(Transfer).clear()
    await conn.getRepository(Energy).clear()
    await conn.getRepository(Snapshot).clear()
    await conn.getRepository(Config).delete({ key: 'dual-token-head'})
}).then(() => {
    process.exit()
}).catch(e => {
    console.log(e)
})
