import { EntityManager, getConnection, MoreThan, EntitySchema } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { REVERSIBLE_WINDOW } from '../config'
import { Block } from '../explorer-db/entity/block'
import { Config } from '../explorer-db/entity/config'
import { TransactionMeta } from '../explorer-db/entity/tx-meta'
import { Transaction } from '../explorer-db/entity/transaction'
import { BranchTransaction } from '../explorer-db/entity/branch-transaction'

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

    public listRecentBlock(head: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // get [head-REVERSIBLE_WINDOW-1, head]
        const blockID = '0x' + BigInt(head - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, 'f')

        return manager
            .getRepository(Block)
            .find({
                where: { id: MoreThan(blockID) },
                order: { id: 'ASC' }
            })
    }

    public updateBlock(id: string, partialEntity: QueryDeepPartialEntity<Block>, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return  manager
            .getRepository(Block)
            .update({id}, partialEntity)
    }

    public removeBlock(id: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return  manager
            .getRepository(Block)
            .delete({id})
    }

    public removeBranchTransaction(blockID: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(BranchTransaction)
            .delete({blockID})
    }

    public removeTransactionMeta(blockID: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(TransactionMeta)
            .delete({blockID})
    }

    public insertBlock(block: QueryDeepPartialEntity<Block>, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Block, block)
    }

    public insertTransactionMeta(metas: Array<QueryDeepPartialEntity<TransactionMeta>>, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(TransactionMeta, metas)
    }

    public insertTransaction(txs: Array<QueryDeepPartialEntity<Transaction>>, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Transaction, txs)
    }

    public insertBranchTransaction(
        txs: Array<QueryDeepPartialEntity<BranchTransaction>>,
        manager?: EntityManager
    ) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(BranchTransaction, txs)
    }
}
