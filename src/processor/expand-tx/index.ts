import { SnapType, MoveType, CountType } from '../../explorer-db/types'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { insertSnapshot, listRecentSnapshot, clearSnapShot, removeSnapshot } from '../../service/snapshot'
import { EntityManager, getConnection } from 'typeorm'
import { Processor } from '../processor'
import * as logger from '../../logger'
import { blockIDtoNum } from '../../utils'
import { REVERSIBLE_WINDOW } from '../../config'
import { Block } from '../../explorer-db/entity/block'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { AggregatedTransaction } from '../../explorer-db/entity/aggregated-tx'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Counts } from '../../explorer-db/entity/counts'
import { saveCounts } from '../../service/counts'

const JobCountType = CountType.TX
const JobSnapType = SnapType.ExpandTX

interface SnapCount {
    address: string|null
    in: number
    out: number
    self: number
}

class BlockProcessor {
    private cnt = new Map<string|null, Counts>()
    private snap = new Map<string|null, SnapCount>()

    constructor(
        readonly block: Block,
        readonly manager: EntityManager
    ) { }

    async count(addr: string|null) {
        if (this.cnt.has(addr)) {
            return this.cnt.get(addr)!
        }

        let count: Counts | null = null
        const loaded = await this.manager
            .getRepository(Counts)
            .findOne({ address: addr, type: JobCountType })

        if (loaded) {
            count = loaded
        } else {
            count = this.manager.create(Counts, {
                address: addr,
                type: JobCountType,
                in: 0,
                out: 0,
                self: 0
            })
        }

        this.cnt.set(addr, count)
        this.takeSnap(count)
        return count
    }

    takeSnap(cnt: Counts) {
        this.snap.set(cnt.address, { address: cnt.address, in: cnt.in, out: cnt.out, self: cnt.self })
    }

    counts() {
        return [...this.cnt.values()]
    }

    snapshot() {
        const snapshot = new Snapshot()
        snapshot.blockID = this.block.id
        snapshot.type = JobSnapType
        snapshot.data = null

        if (this.snap.size) {
            snapshot.data = [...this.snap.values()]
        }
        return snapshot
    }
}

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
        return JobSnapType
    }

    protected get skipEmptyBlock() {
        return true
    }
    
    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, saveSnapshot = false) {
        const proc = new BlockProcessor(block, manager)
        const aggregated: AggregatedTransaction[] = []
        for (const [_, meta] of txs.entries()) {
            const rec = new Set<string | null>()

            for (const c of meta.transaction.clauses) {
                if (!rec.has(c.to)) {
                    if (c.to !== meta.transaction.origin) {
                        aggregated.push(manager.create(AggregatedTransaction, {
                            participant: c.to,
                            type: MoveType.In,
                            txID: meta.txID,
                            blockID: block.id,
                            seq: { ...meta.seq }
                        }))
                        const cnt = await proc.count(c.to)
                        cnt.in++
                    }
                    rec.add(c.to)
                }
            }

            aggregated.push(manager.create(AggregatedTransaction, {
                participant: meta.transaction.origin,
                type: rec.has(meta.transaction.origin) ? MoveType.Self : MoveType.Out,
                txID: meta.txID,
                blockID: block.id,
                seq: { ...meta.seq }
            }))
            const cnt = await proc.count(meta.transaction.origin)
            rec.has(meta.transaction.origin) ? cnt.self++ : cnt.out++
        }
        await this.persist.saveTXs(aggregated, manager)
        await saveCounts(proc.counts(), manager)
        if (saveSnapshot) {
            await insertSnapshot(proc.snapshot(), manager)
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
                    const counts = new Map<string|null, Counts>()
                    for (; snapshots.length;) {
                        const snap = snapshots.pop()!
                        if (snap.data) {
                            for (const c of snap.data as SnapCount[]) {
                                const cnt = manager.create(Counts, {
                                    address: c.address,
                                    type: JobCountType,
                                    in: c.in,
                                    out: c.out,
                                    self: c.self
                                })
                                counts.set(c.address, cnt)
                            }
                        }
                    }

                    await this.persist.removeTXs(toRevert, manager)
                    if (counts.size) await saveCounts([...counts.values()], manager)
                    await this.saveHead(headNum, manager)
                    await removeSnapshot(toRevert, this.snapType, manager)
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
