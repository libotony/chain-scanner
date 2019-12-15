import { Account } from '../explorer-db/entity/account'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType } from '../explorer-db/types'
import { In, createConnection, getConnectionOptions, Not } from 'typeorm'
import { BuybackTheft } from '../explorer-db/entity/buyback-theft'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))

    const hackers = await conn.getRepository(BuybackTheft).find()
    if (hackers.length) {
        await conn.getRepository(Account)
            .update({address: In(hackers.map(x => x.address))}, {alias: null})
    }
    await conn.getRepository(BuybackTheft).clear()
    await conn.getRepository(Snapshot).delete({type: SnapType.BuybackTheft})
    await conn.getRepository(Config).delete({ key: 'buyback-incident-watcher-head'})
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
})
