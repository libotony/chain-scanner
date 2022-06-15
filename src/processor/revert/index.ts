import { SnapType, VMError } from '../../explorer-db/types'
import { Persist } from './persist'
import { EntityManager, getConnection } from 'typeorm'
import { Processor } from '../processor'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { Block } from '../../explorer-db/entity/block'
import { cry, abi } from 'thor-devkit'
import { Thor } from '../../thor-rest'
import * as logger from '../../logger'
import { REVERSIBLE_WINDOW } from '../../config'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { clearSnapShot, insertSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { getExpandedBlockByNumber } from '../../service/block'
import { blockIDtoNum } from '../../utils'

const revertReasonSelector = '0x' + cry.keccak256('Error(string)').toString('hex').slice(0, 8)
const panicErrorSelector = '0x' + cry.keccak256('Panic(uint256)').toString('hex').slice(0, 8)

export class RevertReason extends Processor {
    private persist: Persist

    constructor(readonly thor: Thor) {
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

    protected get snapType() {
        return SnapType.Revert
    }


    protected get skipEmptyBlock() {
        return true
    }

    protected needFlush(count: number) {
        return count >= 100
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, saveSnapshot = false) {
        let cnt = 0
        for (const [txIndex, txMeta] of txs.entries()) {
            const tx = txMeta.transaction
            if (tx.reverted && tx.vmError == null) {
                for (const [clauseIndex, _] of tx.clauses.entries()) {
                    const tracer = await this.thor.traceClause(block.id, txIndex, clauseIndex)
                    if (tracer.error) {
                        const vmError: VMError = {
                            error: tracer.error,
                            clauseIndex,
                            reason: null
                        }
                        if (vmError.error === 'execution reverted' && tracer.output) {
                            if (tracer.output.indexOf(revertReasonSelector) === 0) {
                                try {
                                    const decoded = abi.decodeParameter('string', '0x' + tracer.output.slice(10))
                                    if (decoded) {
                                        vmError.reason = decoded
                                    }
                                } catch {
                                    logger.error(`decode Error(string) failed for tx: ${tx.txID} at clause ${clauseIndex}`)
                                }
                            } else if (tracer.output.indexOf(panicErrorSelector) === 0) {
                                try {
                                    const decoded = abi.decodeParameter('uint256', '0x' + tracer.output.slice(10))
                                    if (decoded) {
                                        vmError.reason = decoded
                                    }
                                } catch {
                                    logger.error(`decode Panic(uint256) failed for tx: ${tx.txID} at clause ${clauseIndex}`)
                                }
                            } else {
                                logger.error(`unknown revert data format for tx: ${tx.txID} at clause ${clauseIndex}`)
                            }
                        }
                        await this.persist.updateVmError(tx.txID, vmError)
                        cnt++
                        break
                    }
                }
            }
        }

        if (saveSnapshot && cnt > 0) {
            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = this.snapType
            snapshot.data = null
            await insertSnapshot(snapshot, manager)
        }

        return cnt
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < REVERSIBLE_WINDOW) {
            return
        }

        const snapshots = await listRecentSnapshot(head, this.snapType)
        if (snapshots.length) {
            const ids: string[] = []
            for (const snap of snapshots) {
                if (snap.block.isTrunk === false) {
                    ids.push(snap.blockID)
                }
            }

            if (ids.length) {
                await getConnection().transaction(async (manager) => {
                    for (const blkID of ids) {
                        const { block, txs } = await getExpandedBlockByNumber(blockIDtoNum(blkID))
                        await this.processBlock(block as Block, txs, manager)
                    }
                })
            }
        }
        await clearSnapShot(head, this.snapType)

        return
    }

    protected async processGenesis() {
        return
    }
}
