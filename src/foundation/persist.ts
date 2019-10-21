import { Thor } from '../thor-rest'
import { Config } from '../db/entity/config'
import { EntityManager, getConnection, In } from 'typeorm'
import { Block } from '../db/entity/block'
import { displayID } from '../utils'
import { Transaction } from '../db/entity/transaction'
import { Receipt } from '../db/entity/receipt'
import { Clause } from '../db/entity/clause'

const HEAD_KEY = 'foundation-head'

export class Persist {

    public saveHead(val: string, manager?: EntityManager) {
        console.log('-----save head:', displayID(val))
        if (!manager) {
            manager = getConnection().manager
        }

        const config = new Config()
        config.key = HEAD_KEY
        config.value = val

        return manager.save(config)
    }

    public getHead() {
        return getConnection()
            .getRepository(Config)
            .findOne({ key: HEAD_KEY })
    }

    public toBranch(ids: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Block)
            .update({ id: In(ids) }, { isTrunk: false })
    }

    /**
     * @return inserted column number
     */
    public async insertBlock(
        b: Required<Connex.Thor.Block>,
        thor: Thor,
        manager?: EntityManager,
        trunk = true
    ): Promise<number> {
        if (!manager) {
            manager = getConnection().manager
        }
        const head = b.id

        // const label = `block(${displayID(b.id)})`
        // console.time(label)

        const block = manager.create(Block, { ...b, isTrunk: trunk })

        const txs: Transaction[] = []
        const receipts: Receipt[] = []
        const clauses: Clause[] = []

        for (const [index, txID] of b.transactions.entries()) {
            const t = await thor.getTransaction(txID, head)
            const r = await thor.getReceipt(txID, head)

            txs.push(manager.create(Transaction, {
                ...t,
                id: undefined,
                txID: t.id,
                txIndex: index,
                block: { id: b.id }
            }))
            for (const [i, c] of t.clauses.entries()) {
                clauses.push(manager.create(Clause, { ...c, clauseIndex: i, transaction: { txID: t.id } }))
            }

            receipts.push(manager.create(Receipt, { ...r, txID: t.id, txIndex: index, block: { id: b.id } }))
        }
        await manager.insert(Block, block)
        if (txs.length) {
            await manager.insert(Transaction, txs)
            await this.saveClauses(clauses, manager)
            await manager.insert(Receipt, receipts)
        }
        // console.timeEnd(label)
        return 1 + txs.length + clauses.length + receipts.length
    }

    private async saveClauses(clauses: Clause[], manager: EntityManager) {
        const cache = new Map<string, boolean>()
        for (const c of clauses) {
            if (cache.has(c.transaction.txID)) {
                const has = cache.get(c.transaction.txID)
                if (!has) {
                    await manager.save(Clause, c)
                }
            } else {
                const num = await manager
                    .getRepository(Clause)
                    .count({ transaction: c.transaction })
                if (num) {
                    cache.set(c.transaction.txID, true)
                } else {
                    cache.set(c.transaction.txID, false)
                    await manager.save(Clause, c)
                }
            }
        }
    }

}
