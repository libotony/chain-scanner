import { Config } from '../explorer-db/entity/config'
import { EntityManager, getConnection, In, MoreThan } from 'typeorm'
import { Block } from '../explorer-db/entity/block'
import { REVERSIBLE_WINDOW } from '../utils'
import { Transaction } from '../explorer-db/entity/transaction'
import { Receipt } from '../explorer-db/entity/receipt'
import { BranchTransaction } from '../explorer-db/entity/branch-transaction'
import { BranchReceipt } from '../explorer-db/entity/branch-receipt'

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

    public async toBranch(ids: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // from trunk
        const txs = await manager
            .getRepository(Transaction)
            .find({ blockID: In([...ids]) })

        const receipts = await manager
            .getRepository(Receipt)
            .find({ blockID: In([...ids]) })

        await this.insertBranchTXs(txs.map(x => {
            return manager!.create(BranchTransaction, {
                ...x
            })
        }), manager)

        await this.insertBranchReceipts(receipts.map(x => {
            return manager!.create(BranchReceipt, {
                ...x
            })
        }), manager)

        await manager
            .getRepository(Receipt)
            .delete({ blockID: In([...ids]) })

        await manager
            .getRepository(Transaction)
            .delete({ blockID: In([...ids]) })

        await manager
            .getRepository(Block)
            .update({ id: In([...ids]) }, { isTrunk: false })

        return
    }

    public async toTrunk(ids: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // from branch
        const txs = await manager
            .getRepository(BranchTransaction)
            .find({ blockID: In([...ids]) })

        const receipts = await manager
            .getRepository(BranchReceipt)
            .find({ blockID: In([...ids]) })

        await this.insertTXs(txs.map(x => {
            return manager!.create(Transaction, {
                ...x
            })
        }), manager)

        await this.insertReceipts(receipts.map(x => {
            return manager!.create(Receipt, {
                ...x
            })
        }), manager)

        await manager
            .getRepository(BranchReceipt)
            .delete({ blockID: In([...ids]) })

        await manager
            .getRepository(BranchTransaction)
            .delete({ blockID: In([...ids]) })

        await manager
            .getRepository(Block)
            .update({ id: In([...ids]) }, { isTrunk: true })

        return
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

    public insertBranchTXs(txs: BranchTransaction[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(BranchTransaction, txs)
    }

    public insertBranchReceipts(receipts: BranchReceipt[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(BranchReceipt, receipts)
    }
}
