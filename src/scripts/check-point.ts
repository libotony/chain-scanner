import { initConnection } from '../db'
import { Account } from '../db/entity/account'
import { Transfer } from '../db/entity/transfer'
import { Energy } from '../db/entity/energy'
import { Config } from '../db/entity/config'
import { Snapshot } from '../db/entity/snapshot'

initConnection().then(async (conn) => {
    await conn.getRepository(Account).clear()
    await conn.getRepository(Transfer).clear()
    await conn.getRepository(Energy).clear()
    await conn.getRepository(Snapshot).clear()
    console.log(await conn.getRepository(Config).delete({ key: 'dual-token-head'}))
}).then(() => {
    process.exit()
}).catch(e => {
    console.log(e)
})
