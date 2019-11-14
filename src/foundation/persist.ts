import { Thor } from '../thor-rest'
import { Config } from '../explorer-db/entity/config'
import { EntityManager, getConnection, In } from 'typeorm'
import { Block } from '../explorer-db/entity/block'
import { REVERSIBLE_WINDOW } from '../utils'
import { Transaction } from '../explorer-db/entity/transaction'
import { Receipt } from '../explorer-db/entity/receipt'

const HEAD_KEY = 'foundation-head'

export class Persist {

    public saveHead(val: string, manager?: EntityManager) {
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

    public insertBlock(block: Block, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Block, block)
    }

    public insertTXs(txs: Transaction[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Transaction, txs)
    }

    public insertReceipts(receipts: Receipt[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Receipt, receipts)
    }

    /**
     * @return inserted column number
     */
    public async insertBlock2(
        b: Required<Connex.Thor.Block>,
        thor: Thor,
        manager?: EntityManager,
        trunk = true
    ): Promise<number> {
        if (!manager) {
            manager = getConnection().manager
        }

        const head = b.id
        let reward = BigInt(0)
        let score = 0

        if (b.number > 0) {
            const prevBlock = await thor.getBlock(b.parentID)
            score = b.totalScore - prevBlock.totalScore
        }

        const getBlockDetail = async (b: Required<Connex.Thor.Block>) => {
            const txs: Connex.Thor.Transaction[] = []
            const receipts: Connex.Thor.Receipt[] = []

            try {
                for (const txID of b.transactions) {
                    const [t, r] = await Promise.all([thor.getTransaction(txID, head), thor.getReceipt(txID, head)])
                    txs.push(t)
                    receipts.push(r)
                }
            } catch (e) {
                throw new Error('Failed to get block detail')
            }
            return {txs, receipts}
        }

        const txs: Transaction[] = []
        const receipts: Receipt[] = []

        const detail = await getBlockDetail(b)
        for (const [index, _] of b.transactions.entries()) {
            const t = detail.txs[index]
            const r = detail.receipts[index]

            const txE = manager.create(Transaction, {
                ...t,
                id: undefined,
                txID: t.id,
                txIndex: index,
                blockID: b.id
            })
            txs.push(txE)

            receipts.push(manager.create(Receipt, {
                ...r,
                txID: t.id,
                txIndex: index,
                blockID: b.id,
                paid: BigInt(r.paid),
                reward: BigInt(r.reward)
            }))

            reward += BigInt(r.reward)
        }
        const block = manager.create(Block, { ...b, isTrunk: trunk, score, reward })

        await manager.insert(Block, block)
        if (txs.length) {
            await manager.insert(Transaction, txs)
            await manager.insert(Receipt, receipts)
        }
        return 1 + txs.length + receipts.length
    }
}
