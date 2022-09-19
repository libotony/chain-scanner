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
import { getExpandedBlockByID, getExpandedBlockByNumber, getNextBlockIDWithReverted } from '../../service/block'
import { blockIDtoNum } from '../../utils'

const errorSelector = '0x' + cry.keccak256('Error(string)').toString('hex').slice(0, 8)
const panicSelector = '0x' + cry.keccak256('Panic(uint256)').toString('hex').slice(0, 8)

const decodeReason = (output: string): string | null => {
    if (output.indexOf(errorSelector) === 0 || output.indexOf(panicSelector) === 0) {
        const revert = output.indexOf(errorSelector) === 0

        let type = 'string'
        if (!revert) {
            type = 'uint256'
        }

        try {
            const decoded = abi.decodeParameter(type, '0x' + output.slice(10)) as string
            if (decoded) {
                if (revert) {
                    return decoded
                }

                return `Panic(0x${parseInt(decoded).toString(16).padStart(2, '0')})`
            }
        } catch (e) {
            /* https://docs.soliditylang.org/en/latest/control-structures.html#try-catch
               In some cases, contract A calls B and catches the error as low-level data in bytes then revert the error in A.
               This does not cover every case, e.g. some one just revert(hash) out.
            */
            if (revert) {
                const msg = 'invalid utf8 byte sequence; invalid continuation byte'
                if ((e as Error).toString().includes(msg)) {
                    const decoded = abi.decodeParameter('bytes', '0x' + output.slice(10))
                    return decodeReason(decoded)
                }
            }

            throw e
        }
    }

    return null
}

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

    protected needFlush(count: number) {
        return count >= 100
    }

    protected async nextBlock(from: number, to: number, manager: EntityManager) {
        let blockID = await getNextBlockIDWithReverted(from, to, manager)
        return blockID ? getExpandedBlockByID(blockID) : getExpandedBlockByNumber(to)
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
                        // get inlined call frame error
                        if (vmError.error === 'execution reverted') {
                            const all = await this.thor.traceClause(block.id, txIndex, clauseIndex, false)
                            
                            let e = all.error
                            let t = all
                            for (; ;) {
                                if (!t.calls || !t.calls.length) {
                                    break
                                }
                                t = t.calls[t.calls.length - 1]
                                if (t.error) {
                                    e = t.error    
                                }
                            }
                            if (e && e !== vmError.error) {
                                vmError.error = e
                            }
                        }

                        if (vmError.error === 'execution reverted' && tracer.output) {
                            try {
                                vmError.reason = decodeReason(tracer.output)
                                if (!vmError.reason) {
                                    logger.error(`unknown revert data format for tx: ${tx.txID} at clause ${clauseIndex}`)
                                }
                            } catch (e) {
                                logger.error(`decode reason failed for tx: ${tx.txID} at clause ${clauseIndex}`)
                            }
                        }
                        await this.persist.updateVmError(tx.txID, vmError, manager)
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

        return cnt ? cnt : 1
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
