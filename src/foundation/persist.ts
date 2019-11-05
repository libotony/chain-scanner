import { Thor } from '../thor-rest'
import { Config } from '../db/entity/config'
import { EntityManager, getConnection, In, MoreThan } from 'typeorm'
import { Block } from '../db/entity/block'
import { displayID, REVERSIBLE_WINDOW } from '../utils'
import { Transaction } from '../db/entity/transaction'
import { Receipt } from '../db/entity/receipt'

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

    public toTrunk(ids: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Block)
            .update({ id: In(ids) }, { isTrunk: true })
    }

    public listRecentBlock(head: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // get [head-REVERSIBLE_WINDOW, head]
        const blockID = Buffer.from(BigInt(head - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0'), 'hex')

        return manager
            .getRepository(Block)
            .createQueryBuilder('block')
            .where('id > :blockID', { blockID })
            .orderBy('block.id', 'ASC')
            .getMany()
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

        const block = manager.create(Block, { ...b, isTrunk: trunk })
        const txs: Transaction[] = []
        const receipts: Receipt[] = []

        for (const [index, txID] of b.transactions.entries()) {
            const [t, r] = await Promise.all([thor.getTransaction(txID, head), await thor.getReceipt(txID, head)])

            const txE = manager.create(Transaction, {
                ...t,
                id: undefined,
                txID: t.id,
                txIndex: index,
                blockID: b.id
            })
            for (const clause of txE.clauses) {
                if (clause.data === '0x') {
                    clause.data = ''
                }
            }
            txs.push(txE)

            receipts.push(manager.create(Receipt, {
                ...r,
                txID: t.id,
                txIndex: index,
                blockID: b.id,
                paid: BigInt(r.paid),
                reward: BigInt(r.reward)
            }))
        }
        await manager.insert(Block, block)
        if (txs.length) {
            await manager.insert(Transaction, txs)
            await manager.insert(Receipt, receipts)
        }
        return 1 + txs.length + receipts.length
    }
}
