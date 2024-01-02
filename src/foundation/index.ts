import { Thor } from '../thor-rest'
import { Persist } from './persist'
import { getConnection, EntityManager } from 'typeorm'
import { blockIDtoNum, displayID, sleep } from '../utils'
import { REVERSIBLE_WINDOW } from '../config'
import { InterruptedError } from '../error'
import { EventEmitter } from 'events'
import * as logger from '../logger'
import { BranchTransaction } from '../explorer-db/entity/branch-transaction'
import { TransactionMeta } from '../explorer-db/entity/tx-meta'
import { Output, VMError } from '../explorer-db/types'
import { newIterator, LogItem } from './log-traverser'

const SAMPLING_INTERVAL = 500

export class Foundation {
    private head: string | null = null
    private persist: Persist
    private shutdown = false
    private ev = new EventEmitter()

    constructor(readonly thor: Thor) {
        this.persist = new Persist()
    }

    public async start() {
        this.loop()
        return
    }

    public stop() {
        this.shutdown = true

        return new Promise((resolve) => {
            logger.log('shutting down......')
            this.ev.on('closed', resolve)
        })
    }

    private async getHead(): Promise<string> {
        if (this.head !== null) {
            return this.head
        } else {
            const config = await this.persist.getHead()

            const startPoint = ''
            // const startPoint =  '0x004c4b3f5d7fb5c12315b582e4d62d781c2fcf4d228b3c583637f4450fe79589'
            if (!config) {
                return startPoint
            } else {
                return config.value
            }
        }
    }

    private async latestTrunkCheck() {
        const headID = await this.getHead()
        if (headID === '') {
            return
        }
        const headNum = blockIDtoNum(headID)
        if (headNum < REVERSIBLE_WINDOW) {
            return
        }

        const blocks = await this.persist.listRecentBlock(headNum)
        for (; blocks.length;) {
            const b = blocks[0]
            const onChain = (await this.thor.getBlock(b.id, 'regular'))!
            if (b.isTrunk !== onChain.isTrunk) {
                break
            }
            blocks.shift()
        }

        if (blocks.length) {
            let h = blocks[0].parentID
            logger.log('-> revert to: ' + displayID(h))
            await getConnection().transaction(async (manager) => {
                for (const b of blocks) {
                    if (b.isTrunk) {
                        await this.persist.removeTransactionMeta(b.id, manager)
                    } else {
                        await this.persist.removeBranchTransaction(b.id, manager)
                    }
                }
                for (const b of blocks) {
                    const onChain = await this.thor.getBlock(b.id, 'expanded')
                    if (!onChain) {
                        // rare case of blockID not found
                        await this.persist.removeBlock(b.id, manager)
                        continue
                    } else if (onChain.isTrunk) {
                        await this.block(onChain).update().process(manager)
                        h = b.id
                    } else {
                        await this.block(onChain).update().branch().process(manager)
                    }
                }
                if (h !== headID) {
                    await this.persist.saveHead(h, manager)
                    logger.log('-> save head: ' + displayID(h))
                }
            })
            this.head = h
        } else {
            this.head = headID
        }
    }

    private async loop() {
        for (; ;) {
            try {
                if (this.shutdown) {
                    throw new InterruptedError()
                }
                await sleep(SAMPLING_INTERVAL)

                let head = await this.getHead()
                const best = (await this.thor.getBlock('best', 'expanded'))!

                if (!head) {
                    if (best.number > REVERSIBLE_WINDOW) {
                        await this.fastForward(best.number - REVERSIBLE_WINDOW)
                        head = await this.getHead()
                    } else {
                        continue
                    }
                } else {
                    if (head === best.id) {
                        continue
                    }
                    const headNum = blockIDtoNum(head)
                    if (headNum > best.number) {
                        continue
                    }
                    await this.latestTrunkCheck()
                    if (headNum < best.number - REVERSIBLE_WINDOW) {
                        await this.fastForward(best.number - REVERSIBLE_WINDOW)
                        head = await this.getHead()
                    }
                }

                if (best.parentID === head) {
                    const timeLogger = logger.task()
                    await getConnection().transaction(async (manager) => {
                        await this.block(best).process(manager)
                        await this.persist.saveHead(best.id, manager)
                        logger.log(`-> save head: ${displayID(best.id)}(${best.timestamp % 60}), elapsed: ${timeLogger.elapsed}`)
                    })
                    this.head = best.id
                } else {
                    const headBlock = (await this.thor.getBlock(head, 'expanded'))!
                    const { ancestor, trunk, branch } = await this.buildFork(best, headBlock)

                    if (branch.length || ancestor !== head) {
                        // let latestTrunkCheck do the heavy work
                        continue
                    }

                    await getConnection().transaction(async (manager) => {
                        for (const b of trunk) {
                            await this.block(b).process(manager)
                        }
                        await this.persist.saveHead(best.id, manager)
                        logger.log('-> save head:' + displayID(best.id))
                    })
                    this.head = best.id
                }
            } catch (e) {
                if (!(e instanceof InterruptedError)) {
                    logger.error('foundation loop: ' + (e as Error).stack)
                } else {
                    if (this.shutdown) {
                        this.ev.emit('closed')
                        break
                    }
                }
            }
        }
    }

    private async buildFork(trunkHead: Thor.ExpandedBlock, branchHead: Thor.ExpandedBlock) {
        let t = trunkHead
        let b = branchHead

        const branch: Thor.ExpandedBlock[] = []
        const trunk: Thor.ExpandedBlock[] = []

        for (; ;) {
            if (trunk.length > REVERSIBLE_WINDOW || branch.length > REVERSIBLE_WINDOW) {
                throw new Error(`traced back more than ${REVERSIBLE_WINDOW} blocks`)
            }
            if (t.number > b.number) {
                trunk.push(t)
                t = (await this.thor.getBlock(t.parentID, 'expanded'))!
                continue
            }

            if (t.number < b.number) {
                branch.push(b)
                b = (await this.thor.getBlock(b.parentID, 'expanded'))!
                continue
            }

            if (t.id === b.id) {
                return {
                    ancestor: t.id,
                    trunk: trunk.reverse(),
                    branch: branch.reverse(),
                }
            }

            trunk.push(t)
            branch.push(b)

            t = (await this.thor.getBlock(t.parentID, 'expanded'))!
            b = (await this.thor.getBlock(b.parentID, 'expanded'))!
        }

    }

    private block(b: Thor.ExpandedBlock) {
        let isTrunk = true
        let justUpdate = false
        return {
            branch() {
                isTrunk = false
                return this
            },
            update() {
                justUpdate = true
                return this
            },
            process: async (manager: EntityManager): Promise<number> => {
                let reward = BigInt(0)
                let score = 0
                let gasChanged = 0
                let revertCount = 0

                if (b.number > 0) {
                    const prevBlock = (await this.thor.getBlock(b.parentID, 'regular'))!
                    score = b.totalScore - prevBlock.totalScore
                    gasChanged = b.gasLimit - prevBlock.gasLimit
                }

                const txs: Array<Omit<Omit<BranchTransaction, 'block'>, 'id'>> = []
                const metas: Array<Omit<Omit<TransactionMeta, 'block'>, 'transaction'>> = []

                for (const [index, tx] of b.transactions.entries()) {
                    metas.push({
                        txID: tx.id,
                        blockID: b.id,
                        seq: {
                            blockNumber: b.number,
                            txIndex: index
                        }
                    })

                    const outputs: Output[] = []
                    let vmError: VMError | null = null
                    if (!tx.reverted) {
                        for (const [clauseIndex, o] of tx.outputs.entries()) {
                            const output: Output = {
                                contractAddress: o.contractAddress,
                                events: [],
                                transfers: []
                            }
                            if (o.events.length && o.transfers.length) {
                                const tracer = await this.thor.traceClause(b.id, index, clauseIndex, false)
                                try {
                                    let logIndex = 0
                                    for (const item of newIterator(tracer, o.events, o.transfers)) {
                                        if (item.type === 'event') {
                                            output.events.push({
                                                ...(item as LogItem<'event'>).data,
                                                overallIndex: logIndex++
                                            })
                                        } else {
                                            output.transfers.push({
                                                ...(item as LogItem<'transfer'>).data,
                                                overallIndex: logIndex++
                                            })
                                        }
                                    }
                                } catch (e) {
                                    logger.error(`failed to re-organize logs(${tx.id}),err: ${(e as Error).toString()}`)
                                    let logIndex = 0
                                    output.transfers = []
                                    output.events = []
                                    for (const t of o.transfers) {
                                        output.transfers.push({
                                            ...t,
                                            overallIndex: logIndex++
                                        })
                                    }
                                    for (const e of o.events) {
                                        output.events.push({
                                            ...e,
                                            overallIndex: logIndex++
                                        })
                                    }
                                }
                            } else if (o.events.length) {
                                for (let i = 0; i < o.events.length; i++) {
                                    output.events.push({
                                        ...o.events[i],
                                        overallIndex: i
                                    })
                                }
                            } else {
                                for (let i = 0; i < o.transfers.length; i++) {
                                    output.transfers.push({
                                        ...o.transfers[i],
                                        overallIndex: i
                                    })
                                }
                            }
                            outputs.push(output)
                        }
                    } else {
                        revertCount++
                    }

                    txs.push({
                        txID: tx.id,
                        blockID: b.id,
                        seq: {
                            blockNumber: b.number,
                            txIndex: index
                        },
                        chainTag: tx.chainTag,
                        blockRef: tx.blockRef,
                        expiration: tx.expiration,
                        gasPriceCoef: tx.gasPriceCoef,
                        gas: tx.gas,
                        nonce: tx.nonce,
                        dependsOn: tx.dependsOn,
                        origin: tx.origin,
                        delegator: tx.delegator as string | null,
                        clauses: tx.clauses,
                        clauseCount: tx.clauses.length,
                        size: tx.size,
                        gasUsed: tx.gasUsed,
                        gasPayer: tx.gasPayer,
                        paid: BigInt(tx.paid),
                        reward: BigInt(tx.reward),
                        reverted: tx.reverted,
                        outputs,
                        vmError
                    })
                    reward += BigInt(tx.reward)
                }
                if (justUpdate) {
                    await this.persist.updateBlock(b.id, { isTrunk }, manager)
                } else {
                    await this.persist.insertBlock({
                        ...b,
                        isTrunk,
                        score,
                        reward,
                        gasChanged,
                        txCount: b.transactions.length,
                        revertCount: revertCount
                    }, manager)
                }
                if (txs.length) {
                    if (isTrunk) {
                        await this.persist.insertTransactionMeta(metas, manager)
                        await this.persist.insertTransaction(txs, manager)
                    } else {
                        await this.persist.insertBranchTransaction(txs, manager)
                    }
                }
                return 1 + txs.length * 2
            }
        }
    }
    
    private async fastForward(target: number) {
        const head = await this.getHead()
        const headNum = head ? blockIDtoNum(head) : -1
        const taskLogger = logger.task()

        let column = 0
        let b: Thor.ExpandedBlock

        for (let i = headNum; i <= target;) {
            taskLogger.update(i)
            await getConnection().transaction(async (manager) => {
                for (; i <= target;) {
                    i += 1
                    b = (await this.getBlockFromREST(i))!
                    column += await this.block(b).process(manager)

                    if (column >= 3000 || i >= target || this.shutdown) {
                        await this.persist.saveHead(b.id, manager)
                        column = 0
                        taskLogger.update(i)
                        break
                    }
                }
            })
            logger.log(`imported blocks(${taskLogger.processed}) at block(${displayID(b!.id)}), time: ${taskLogger.elapsed}`)
            taskLogger.reset()

            this.head = b!.id

            if (this.shutdown) {
                throw new InterruptedError()
            }
        }
    }

    private async getBlockFromREST(num: number) {
        const b = await this.thor.getBlock(num, 'expanded');
        // cache for the following blocks
        (async () => {
            if (num % 5 == 0) {
                for (let i = 1; i <= 10; i++) {
                    await this.thor.getBlock(num + i, 'expanded')
                }
            }            
        })().catch()
        return b
    }

}
