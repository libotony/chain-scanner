import { Thor } from '../thor-rest'
import { Persist } from './persist'
import { getConnection, EntityManager } from 'typeorm'
import { blockIDtoNum, displayID, REVERSIBLE_WINDOW, sleep, InterruptedError } from '../utils'
import { EventEmitter } from 'events'
import { TransactionMeta } from '../explorer-db/entity/tx-meta'
import { Transaction } from '../explorer-db/entity/transaction'
import { Block } from '../explorer-db/entity/block'
import * as logger from '../logger'

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

            // const startPoint = ''
            const startPoint =  '0x004c4b3f5d7fb5c12315b582e4d62d781c2fcf4d228b3c583637f4450fe79589'
            if (!config) {
                return startPoint
            } else {
                return  config.value
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
            await getConnection().transaction(async (manager) => {
                const trunk: number[] = []
                for (const b of blocks) {
                    const onChain = await this.thor.getBlock(b.id, 'expanded')
                    if (!onChain) {
                        // rare case of blockID not found
                        await this.persist.updateBlock(b.id, { isTrunk: false }, manager)
                        if (b.isTrunk) {
                            await this.persist.removeTransaction(b.id, manager)
                        } else {
                            await this.persist.removeBranchTXMeta(b.id, manager)
                        }
                        logger.log('mark missing block to branch: ' + displayID(b.id))
                        continue
                    }
                    if (b.isTrunk !== onChain.isTrunk) {
                        if (onChain.isTrunk) {
                            h = b.id
                            trunk.push(b.number)
                            // from branch to trunk
                            await this.persist.removeBranchTXMeta(b.id, manager)
                            await this.block(onChain)
                                .update()
                                .process(manager)
                            logger.log('block to trunk: ' + displayID(b.id))
                        } else {
                            // from trunk to branch
                            await this.persist.removeTransaction(b.id, manager)
                            await this.block(onChain)
                                .update()
                                .branch()
                                .process(manager)
                            logger.log('block to branch: ' + displayID(b.id))
                        }
                    } else if (b.isTrunk) {
                        h = b.id
                        trunk.push(b.number)
                    }
                }
                // maintain trunk block number continuity
                if (trunk.length > 1) {
                    let curr = trunk[0]
                    for (let i = 1; i < trunk.length;) {
                        if (trunk[i] > curr + 1) {
                            const b = (await this.thor.getBlock(curr + 1, 'expanded'))!
                            await this.block(b).process(manager)
                            logger.log('imported missing block: ' + displayID(b.id))
                            curr++
                            continue
                        }
                        curr = trunk[i++]
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
                    const timeLogger = logger.taskTime(new Date())
                    await getConnection().transaction(async (manager) => {
                        await this.block(best).process(manager)
                        await this.persist.saveHead(best.id, manager)
                        logger.log(`-> save head: ${displayID(best.id)}(${best.timestamp % 60}) ${timeLogger(new Date())}`)
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
                    logger.error('foundation loop: ' + (e as Error).stack )
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
            if (trunk.length >= REVERSIBLE_WINDOW || branch.length >= REVERSIBLE_WINDOW) {
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

                if (b.number > 0) {
                    const prevBlock = (await this.thor.getBlock(b.parentID, 'regular'))!
                    score = b.totalScore - prevBlock.totalScore
                    gasChanged = b.gasLimit - prevBlock.gasLimit
                }

                const txs: TransactionMeta[] = []

                for (const [index, tx] of b.transactions.entries()) {
                    const meta = manager.create(TransactionMeta, {
                        txID: tx.id,
                        blockID: b.id,
                        seq: {
                            blockNumber: b.number,
                            txIndex: index
                        }
                    })
                    if (isTrunk) {
                        const t = manager.create(Transaction, {
                            txID: tx.id,
                            chainTag: tx.chainTag,
                            blockRef: tx.blockRef,
                            expiration: tx.expiration,
                            gasPriceCoef: tx.gasPriceCoef,
                            gas: tx.gas,
                            nonce: tx.nonce,
                            dependsOn: tx.dependsOn,
                            origin: tx.origin,
                            delegator: tx.delegator,
                            clauses: tx.clauses,
                            clauseCount: tx.clauses.length,
                            size: tx.size,
                            gasUsed: tx.gasUsed,
                            gasPayer: tx.gasPayer,
                            paid: BigInt(tx.paid),
                            reward: BigInt(tx.reward),
                            reverted: tx.reverted,
                            outputs: tx.outputs
                        })
                        meta.transaction = t
                    }
                    txs.push(meta)

                    reward += BigInt(tx.reward)
                }
                if (justUpdate) {
                    await this.persist.updateBlock(b.id, {isTrunk}, manager)
                } else {
                    const block = manager.create(Block, {
                        ...b,
                        isTrunk,
                        score,
                        reward,
                        gasChanged,
                        txCount: b.transactions.length
                    })
                    await this.persist.insertBlock(block, manager)
                }
                return 1 + txs.length * 2
            }
        }
    }

    private async fastForward(target: number) {
        const head = await this.getHead()
        const headNum = head ? blockIDtoNum(head) : -1

        let count = 0
        let b: Thor.ExpandedBlock

        for (let i = headNum + 1; i <= target;) {
            const startNum = i
            console.time('time')
            await getConnection().transaction(async (manager) => {
                for (; i <= target;) {
                    if (this.shutdown) {
                        throw new InterruptedError()
                    }
                    b = (await this.getBlockFromREST(i++))!
                    count += await this.block(b).process(manager)

                    if (count >= 3000) {
                        await this.persist.saveHead(b.id, manager)
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${displayID(b.id)}) `)
                        console.timeEnd('time')
                        count = 0
                        break
                    }

                    if (i === target + 1) {
                        await this.persist.saveHead(b.id, manager)
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${displayID(b.id)}) `)
                        console.timeEnd('time')
                        break
                    }
                }
            })
            this.head = b!.id
        }
    }

    private async getBlockFromREST(num: number) {
        const b = await this.thor.getBlock(num, 'expanded');
        // cache for the following blocks
        (async () => {
            for (let i = 1; i <= 10; i++) {
                await this.thor.getBlock(num + i, 'expanded')
            }
        })()
        return b
    }

}
