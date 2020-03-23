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

    public async moveTxs(toBranch: string[], toTrunk: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // from trunk to branch
        let bTXs: Transaction[] = []
        let bReceipts: Receipt[] = []

        // from branch to trunk
        let tTxs: BranchTransaction[] = []
        let tReceipts: BranchReceipt[] = []

        if (toBranch.length) {
            bTXs = await manager
                .getRepository(Transaction)
                .find({ blockID: In([...toBranch]) })

            bReceipts = await manager
                .getRepository(Receipt)
                .find({ blockID: In([...toBranch]) })
        }
        if (toTrunk.length) {
            tTxs = await manager
                .getRepository(BranchTransaction)
                .find({ blockID: In([...toTrunk]) })

            tReceipts = await manager
                .getRepository(BranchReceipt)
                .find({ blockID: In([...toTrunk]) })
        }

        if (toBranch.length) {
            await manager
                .getRepository(Receipt)
                .delete({ blockID: In([...toBranch]) })

            await manager
                .getRepository(Transaction)
                .delete({ blockID: In([...toBranch]) })
            await manager
                .getRepository(Block)
                .update({ id: In([...toBranch]) }, { isTrunk: false })
        }

        if (toTrunk.length) {
            await manager
                .getRepository(BranchReceipt)
                .delete({ blockID: In([...toTrunk]) })

            await manager
                .getRepository(BranchTransaction)
                .delete({ blockID: In([...toTrunk]) })

            await manager
                .getRepository(Block)
                .update({ id: In([...toTrunk]) }, { isTrunk: true })
        }

        if (bTXs.length) {
            await this.insertBranchTXs(bTXs.map(x => {
                return manager!.create(BranchTransaction, {
                    ...x
                })
            }), manager)
            await this.insertBranchReceipts(bReceipts.map(x => {
                return manager!.create(BranchReceipt, {
                    ...x
                })
            }), manager)
        }

        if (tTxs.length) {
            await this.insertTXs(tTxs.map(x => {
                return manager!.create(Transaction, {
                    ...x
                })
            }), manager)
            await this.insertReceipts(tReceipts.map(x => {
                return manager!.create(Receipt, {
                    ...x
                })
            }), manager)
        }
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
