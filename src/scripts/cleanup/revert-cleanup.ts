import { Config } from '../../explorer-db/entity/config'
import { createConnection, getConnectionOptions, In } from 'typeorm'
import { Persist } from '../../processor/revert/persist'
import { getPrevBlockIDWithReverted } from '../../service/block'
import { Transaction } from '../../explorer-db/entity/transaction'
import { blockIDtoNum } from '../../utils'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'

let shutdown = false
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        if (!shutdown) {
            shutdown = true
            process.stdout.write(`got signal: ${s} ${sig}, terminating
`)
        }
    })
})


Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
        // logging: true,
        logger: undefined
    }))

    const persist = new Persist()
    const head = await persist.getHead()
    if (head === null) {
        throw new Error('No revert task head, aborting')
    }

    let lastLogged = head
    for (let i = head; i > 0; i--) {
        await conn.transaction(async (manager) => {
            const blockID = await getPrevBlockIDWithReverted(0, i, manager)
            if (blockID === null) return

            const txs = await conn
                .getRepository(TransactionMeta)
                .find({
                    where: { blockID: blockID },
                    select: ['txID']
                })

            const ids = txs.map(x => x.txID)
            await conn
                .getRepository(Transaction)
                .update({
                    txID: In(ids),
                    reverted: true
                }, {
                    vmError: null
                })

            const blockNum = blockIDtoNum(blockID)
            const head = blockNum > 0 ? blockNum - 1 : 0
            await persist.saveHead(head, manager)
            i = blockNum

            if (lastLogged - i > 10000) {
                console.log(`Processed to block(${i})`)
                lastLogged = i
            }
        })
        if (shutdown) {
            break
        }
    }
    if (!shutdown) {
        await conn.getRepository(Config).delete({ key: 'revert-head' })
    }
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log(e)
    process.exit(-1)
})
