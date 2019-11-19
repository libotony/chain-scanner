import { Config } from '../explorer-db/entity/config'
import { EntityManager, getConnection, In, MoreThan } from 'typeorm'
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
            .find({
                where: { id: MoreThan(blockID) },
                order: {id: 'ASC'}
            })
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
}
