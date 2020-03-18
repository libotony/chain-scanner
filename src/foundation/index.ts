import { Thor } from '../thor-rest'
import { Persist } from './persist'
import { getConnection, EntityManager } from 'typeorm'
import { blockIDtoNum, displayID, REVERSIBLE_WINDOW, sleep, InterruptedError } from '../utils'
import { EventEmitter } from 'events'
import { getBlockByID } from '../service/block'
import { Transaction } from '../explorer-db/entity/transaction'
import { Receipt } from '../explorer-db/entity/receipt'
import { Block } from '../explorer-db/entity/block'
import { BranchTransaction } from '../explorer-db/entity/branch-transaction'
import { BranchReceipt } from '../explorer-db/entity/branch-receipt'
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

    private async latestTrunkCheck() {
        const head = await this.getHead()

        if (head === '') {
            return
        }

        const headNum = blockIDtoNum(head)
        if (headNum < REVERSIBLE_WINDOW) {
            return
        }

        let newHead: string|null  = null
        const blocks = await this.persist.listRecentBlock(headNum)
        if (blocks.length) {
            await getConnection().transaction(async (manager) => {
                const toBranch: string[] = []
                const toTrunk: string[] = []

                for (const b of blocks) {
                    const chainB = await this.thor.getBlock(b.id, 'regular')
                    if (chainB.isTrunk !== b.isTrunk) {
                        b.isTrunk = chainB.isTrunk
                        if (chainB.isTrunk) {
                            toTrunk.push(b.id)
                        } else {
                            toBranch.push(b.id)
                        }
                    }
                }
                if (toBranch.length) {
                    await this.persist.toBranch(toBranch, manager)
                }
                if (toTrunk.length) {
                    await this.persist.toTrunk(toTrunk, manager)
                }

                const trunks = blocks.filter(x => x.isTrunk === true)
                let current = trunks[0]
                for (let i = 1; i < trunks.length; i++) {
                    if (trunks[i].parentID !== current.id) {
                        break
                    }
                    current = trunks[i]
                }

                if (current.id !== head) {
                    await this.persist.saveHead(current.id, manager)
                    logger.log('-> revert to head: ' + displayID(current.id))
                    newHead = current.id
                }
            })
            if (newHead) {
                this.head = newHead
            }
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
                const best = await this.thor.getBlock('best', 'expanded')

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
                    if (headNum > best.number + REVERSIBLE_WINDOW) {
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
                        await this.processBlock(best, manager)
                        await this.persist.saveHead(best.id, manager)
                        logger.log(`-> save head: ${displayID(best.id)}(${best.timestamp % 60}) ${timeLogger(new Date())}`)
                    })
                    this.head = best.id
                } else {
                    const headBlock = await this.thor.getBlock(head, 'expanded')
                    const { trunk, branch } = await this.buildFork(best, headBlock)

                    await getConnection().transaction(async (manager) => {
                        const toBranch: string[] = []
                        const toTrunk: string[] = []

                        const newBranch: Thor.ExpandedBlock[] = []
                        const newTrunk: Thor.ExpandedBlock[] = []

                        for (const b of branch) {
                            const tmp = await getBlockByID(b.id, manager)
                            if (!tmp) {
                                newBranch.push(b)
                            } else if (tmp.isTrunk) {
                                toBranch.push(tmp.id)
                            }
                        }
                        for (const b of trunk) {
                            const tmp = await getBlockByID(b.id, manager)
                            if (!tmp) {
                                newTrunk.push(b)
                            } else if (!tmp.isTrunk) {
                                toTrunk.push(tmp.id)
                            }
                        }

                        if (toBranch.length) {
                            await this.persist.toBranch(toBranch, manager)
                        }
                        if (toTrunk.length) {
                            await this.persist.toTrunk(toTrunk, manager)
                        }

                        for (const b of newBranch) {
                            await this.processBlock(b, manager, false)
                        }
                        for (const b of newTrunk) {
                            await this.processBlock(b, manager, true)
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
            if (t.number > b.number) {
                trunk.push(t)
                t = await this.thor.getBlock(t.parentID, 'expanded')
                continue
            }

            if (t.number < b.number) {
                branch.push(b)
                b = await this.thor.getBlock(b.parentID, 'expanded')
                continue
            }

            if (t.id === b.id) {
                return {
                    trunk: trunk.reverse(),
                    branch: branch.reverse(),
                }
            }

            trunk.push(t)
            branch.push(b)

            t = await this.thor.getBlock(t.parentID, 'expanded')
            b = await this.thor.getBlock(b.parentID, 'expanded')
        }

    }

    private async getHead(): Promise<string> {
        if (this.head !== null) {
            return this.head
        } else {
            const config = await this.persist.getHead()

            const startPoint = ''
            // const startPoint =  '0x0040b280852b6032c7ba2abce32885eecfe0e5e2913a034d8dfe6ee16567123f'
            if (!config) {
                return startPoint
            } else {
                return  config.value
            }
        }
    }

    private async getExpandedBlock(num: number) {
        const b = await this.thor.getBlock(num, 'expanded');
        (async () => {
            for (let i = 0; i < 10; i++) {
                await this.thor.getBlock(num + i, 'expanded')
            }
        })()
        return b
    }

    private async processBlock(
        b: Thor.ExpandedBlock,
        manager: EntityManager,
        trunk = true,
    ): Promise<number> {
        let reward = BigInt(0)
        let score = 0
        let gasChanged = 0

        if (b.number > 0) {
            const prevBlock = await this.thor.getBlock(b.parentID, 'regular')
            score = b.totalScore - prevBlock.totalScore
            gasChanged = b.gasLimit - prevBlock.gasLimit
        }

        const txs: any[] = []
        const receipts: any[] = []

        for (const [index, tx] of b.transactions.entries()) {
            txs.push({
                txID: tx.id,
                blockID: b.id,
                txIndex: index,
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
                size: tx.size
            })
            receipts.push({
                txID: tx.id,
                blockID: b.id,
                txIndex: index,
                gasUsed: tx.gasUsed,
                gasPayer: tx.gasPayer,
                paid: BigInt(tx.paid),
                reward: BigInt(tx.reward),
                reverted: tx.reverted,
                outputs: tx.outputs
            })

            reward += BigInt(tx.reward)
        }
        const block = manager.create(Block, {
            ...b,
            isTrunk: trunk,
            score,
            reward,
            gasChanged,
            txCount: b.transactions.length
        })

        await this.persist.insertBlock(block, manager)
        if (txs.length) {
            if (trunk) {
                await this.persist.insertTXs(txs.map(x => {
                    return manager.create(Transaction, {
                        ...x
                    })
                }), manager)
                await this.persist.insertReceipts(receipts.map(x => {
                    return manager.create(Receipt, {
                        ...x
                    })
                }), manager)
            } else {
                await this.persist.insertBranchTXs(txs.map(x => {
                    return manager.create(BranchTransaction, {
                        ...x
                    })
                }), manager)
                await this.persist.insertBranchReceipts(receipts.map(x => {
                    return manager.create(BranchReceipt, {
                        ...x
                    })
                }), manager)
            }
        }
        return 1 + txs.length + receipts.length
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
                    b = await this.getExpandedBlock(i++)
                    count += await this.processBlock(b, manager)

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

}
