import { Processor } from '../processor'
import { EntityManager, getConnection } from 'typeorm'
import { Persist } from './persist'
import { getBlockTransactions, insertSnapshot, listRecentSnapshot, removeSnapshot, clearSnapShot } from '../../foundation/db'
import { Clause } from '../../db/entity/clause'
import { Snapshot } from '../../db/entity/snapshot'
import { SnapType } from '../../types'
import { blockIDtoNum } from '../../utils'

export class ClauseExtractor extends Processor {
    private persist: Persist

    constructor() {
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

    protected bornAt() {
        return Promise.resolve(0)
    }

    protected async processBlock(blockNum: number, manager: EntityManager,  saveSnapshot= false) {
        const { block, txs } = await getBlockTransactions(blockNum, manager)
        const clauses: Clause[] = []

        for (const t of txs) {
            for (const [i, c] of t.clauses.entries()) {
                clauses.push(manager.create(Clause, {
                    ...c,
                    value: BigInt(c.value),
                    txID: t.txID,
                    clauseIndex: i
                }))
            }
        }

        if (clauses.length) {
            await this.persist.insertClauses(clauses, manager)
            if (saveSnapshot) {
                const snap = manager.create(Snapshot, {
                    blockID: block.id,
                    type: SnapType.ClauseExtractor,
                    data: null
                })
                await insertSnapshot(snap, manager)
            }
        }

        return clauses.length
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < 12) {
            return
        }

        const snapshots = await listRecentSnapshot(head, SnapType.ClauseExtractor)

        if (snapshots.length) {
            for (; snapshots.length;) {
                if (snapshots[0].isTrunk === false) {
                    break
                }
                snapshots.shift()
            }
            if (snapshots.length) {
                const headNum = blockIDtoNum(snapshots[0].blockID) - 1
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {
                    await this.persist.removeClauses(toRevert, manager)
                    await removeSnapshot(toRevert, SnapType.ClauseExtractor, manager)
                    await this.persist.saveHead(headNum, manager)
                    console.log('-> revert to head:', headNum)
                })

                this.head = headNum
            }
        }
        head = await this.getHead()
        await clearSnapShot(head, SnapType.ClauseExtractor)
    }

}
