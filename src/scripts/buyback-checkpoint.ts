import { Account } from '../explorer-db/entity/account'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType } from '../explorer-db/types'
import { In, createConnection, getConnectionOptions, Not } from 'typeorm'
import { BuybackHacker } from '../explorer-db/entity/buyback-hacker'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))

    const hackers = await conn.getRepository(BuybackHacker).find()
    if (hackers.length) {
        await conn.getRepository(Account)
            .update({address: In(hackers.map(x => x.address))}, {alias: null})
    }
    await conn.getRepository(BuybackHacker).clear()
    await conn.getRepository(Snapshot).delete({type: SnapType.BuyBackHacker})
    await conn.getRepository(Config).delete({ key: 'buyback-incident-watcher-head'})
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
})
