import { EntityManager, getConnection } from 'typeorm'
import { sleep } from '../utils'
import { REVERSIBLE_WINDOW } from '../config'
import { InterruptedError, WaitNextTickError } from '../error'
import { EventEmitter } from 'events'
import { getBest, getExpandedBlockByNumber, getNextExpandedBlock } from '../service/block'
import { SnapType } from '../explorer-db/types'
import * as logger from '../logger'
import { Block } from '../explorer-db/entity/block'
import { TransactionMeta } from '../explorer-db/entity/tx-meta'
import { Reporter } from '../reporter'

const SAMPLING_INTERVAL = 1 * 1000

export abstract class Processor {
    protected abstract get snapType(): SnapType
    protected head: number | null = null
    protected birthNumber: number | null = null
    private shutdown = false
    private ev = new EventEmitter()

    public async start() {
        await this.beforeStart()
        this.loop()
        return
    }

    public stop(): Promise<void> {
        this.shutdown = true

        return new Promise((resolve) => {
            logger.log('shutting down......')
            this.ev.on('closed', resolve)
        })
    }

    protected abstract loadHead(manager?: EntityManager): Promise<number | null>
    protected abstract saveHead(head: number, manager?: EntityManager): Promise<void>
    protected abstract bornAt(): Promise<number>
    protected abstract processBlock(
        block: Block,
        txs: TransactionMeta[],
        manager: EntityManager,
        saveSnapshot?: boolean
    ): Promise<number>
    protected abstract latestTrunkCheck(): Promise<void>

    protected async getHead() {
        if (this.head !== null) {
            return this.head
        } else {
            const head = await this.loadHead()
            return head!
        }
    }

    protected async processGenesis(): Promise<void> {
        return
    }

    protected needFlush(count: number) {
        return !!count
    }

    protected get skipEmptyBlock() {
        return false
    }

    private async beforeStart() {
        this.birthNumber = await this.bornAt()

        // process genesis
        const h = await this.loadHead()
        if (!h) {
            await this.processGenesis()
            this.head = this.birthNumber! - 1
            await this.saveHead(this.head)
        }
    }

    private async loop() {
        for (; ;) {
            try {
                if (this.shutdown) {
                    throw new InterruptedError()
                }
                await sleep(SAMPLING_INTERVAL)
                await this.latestTrunkCheck()

                let head = await this.getHead()
                const best = await getBest()

                if (best.number <= head) {
                    continue
                }
                if (best.number - head > REVERSIBLE_WINDOW) {
                    await this.fastForward(best.number - REVERSIBLE_WINDOW)
                    head = await this.getHead()
                }
                const timeLogger = logger.taskTime(new Date())
                await getConnection().transaction(async (manager) => {
                    for (let i = head + 1; i <= best.number; i++) {
                        const { block, txs } = await getExpandedBlockByNumber(i, manager)
                        await this.processBlock(block!, txs, manager, true)
                    }
                    await this.saveHead(best.number, manager)
                    logger.log(`-> save head: ${best.number}(${best.timestamp % 60}) ${timeLogger(new Date())}`)
                })
                this.head = best.number
            } catch (e) {
                if (e instanceof WaitNextTickError) {
                    continue
                } else if (e instanceof InterruptedError) {
                    if (this.shutdown) {
                        this.ev.emit('closed')
                        break
                    }
                } else {
                    logger.error(`processor(${this.constructor.name}) loop: ` + (e as Error).stack)
                }
            }
        }
    }

    private async fastForward(target: number) {
        const head = await this.getHead()
        const reporter = new Reporter()
        let column: number

        for (let i = head; i < target;) {
            column = 0
            await getConnection().transaction(async (manager) => {
                for (; i < target;) {
                    i+=1
                    if (this.skipEmptyBlock) {
                        const { block, txs } = await getNextExpandedBlock(i, manager)
                        if (block) {
                            if (block.number > target) {
                                i = target
                            } else {
                                column += await this.processBlock(block!, txs, manager)
                                i = block.number
                            }
                        }
                        // if next block not found due to missing in database,then we are done :< 
                    } else {
                        const { block, txs } = await getNextExpandedBlock(i, manager)
                        if (!block) {
                            throw new Error(`block(${i} missing in database)`)
                        }
                        column += await this.processBlock(block!, txs, manager)
                    }
                    reporter.update(i)

                    if (this.needFlush(column) || i >= target || this.shutdown) {
                        await this.saveHead(i, manager)
                        break
                    }
                }
            })

            if (i >= target || this.shutdown || reporter.processed >= 1000) {
                process.stdout.write(reporter.log())
            }

            if (this.shutdown) {
                throw new InterruptedError()
            }

            this.head = i
        }
    }
}
