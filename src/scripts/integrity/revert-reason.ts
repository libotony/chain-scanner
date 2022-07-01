import { createConnection, getConnectionOptions } from 'typeorm'
import { blockIDtoNum } from '../../utils'
import { getNextBlockIDWithReverted } from '../../service/block'
import { Transaction } from '../../explorer-db/entity/transaction'
import { Persist } from '../../processor/revert/persist'
import { fixedBytes } from '../../explorer-db/transformers'

const byte32 = fixedBytes(32, 'byte32')

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

    let lastLogged = 0
    for (let i = 0; i <= head; i++) {
        const blockID = await getNextBlockIDWithReverted(i, head)

        if (!blockID) break

        const cnt = await conn
            .getRepository(Transaction)
            .createQueryBuilder('tx')
            .leftJoin('tx.meta', 'txMeta')
            .where('txMeta.blockID=:blockID', { blockID: byte32.to(blockID) })
            .andWhere('tx.reverted=:reverted', { reverted: true })
            .andWhere('tx.vmError=:vmError', { vmError: null })
            .getCount()

        if (cnt) {
            new Error(`Block(${i})}) got unattached reason`)
        }

        if (i - lastLogged > 10000) {
            console.log(`Processed to block(${i})`)
            lastLogged = i
        }
        i = blockIDtoNum(blockID)
    }

    console.log('done!')
    process.exit(0)
}).catch((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(1)
})
