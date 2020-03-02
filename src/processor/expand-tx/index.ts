import { SnapType, MoveDirection } from '../../explorer-db/types'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { insertSnapshot, listRecentSnapshot, clearSnapShot } from '../../service/snapshot'
import { EntityManager, getConnection } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByNumber, getBlockTransactions } from '../../service/block'
import * as logger from '../../logger'
import { AggregatedTransaction } from '../../explorer-db/entity/aggregated-tx'
import { REVERSIBLE_WINDOW, blockIDtoNum } from '../../utils'

export class ExpandTX extends Processor {
    private persist: Persist

    constructor(
        readonly thor: Thor
    ) {
        super()
        this.persist = new Persist()
     }

    protected loadHead(manager?: EntityManager) {
        return this.persist.getHead(manager)
    }

    protected async saveHead(head: number, manager?: EntityManager) {
        await this.persist.saveHead(head, manager)
        return
    }

    protected async bornAt() {
        return Promise.resolve(0)
    }

    protected get snapType() {
        return SnapType.ExpandTX
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const block = (await getBlockByNumber(blockNum, manager))!
        const txs = await getBlockTransactions(block.id, manager)

        const aggregated: AggregatedTransaction[] = []
        for (const [txIndex, tx] of txs.entries()) {
            const rec = new Set<string|null>()

            aggregated.push(manager.create(AggregatedTransaction, {
                participant: tx.origin,
                direction: MoveDirection.Out,
                txID: tx.txID,
                blockID: block.id,
                seq: {
                    blockNumber: block.number,
                    txIndex
                }
            }))

            for (const c of tx.clauses) {
                if (!rec.has(c.to)) {
                    aggregated.push(manager.create(AggregatedTransaction, {
                        participant: c.to,
                        direction: MoveDirection.In,
                        txID: tx.txID,
                        blockID: block.id,
                        seq: {
                            blockNumber: block.number,
                            txIndex
                        }
                    }))
                    rec.add(c.to)
                }
            }
        }
        await this.persist.saveTXs(aggregated, manager)
        if (saveSnapshot) {
            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = this.snapType
            snapshot.data = null

            await insertSnapshot(snapshot, manager)
        }

        return aggregated.length
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < REVERSIBLE_WINDOW) {
            return
        }

        const snapshots = await listRecentSnapshot(head, this.snapType)

        if (snapshots.length) {
            for (; snapshots.length;) {
                if (snapshots[0].block.isTrunk === false) {
                    break
                }
                snapshots.shift()
            }
            if (snapshots.length) {
                const headNum = blockIDtoNum(snapshots[0].blockID) - 1
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {
                    await this.persist.removeTXs(toRevert, manager)
                    await this.saveHead(headNum, manager)
                    logger.log('-> revert to head: ' + headNum)
                })
                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

    protected async processGenesis() {
        return
    }

}
