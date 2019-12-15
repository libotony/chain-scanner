import { EntityManager, getConnection } from 'typeorm'
import { sleep, REVERSIBLE_WINDOW, InterruptedError, WaitNextTickError } from '../utils'
import { EventEmitter } from 'events'
import { getBest } from '../service/block'
import { SnapType } from '../explorer-db/types'

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
            console.log('shutting down......')
            this.ev.on('closed', resolve)
        })
    }

    protected abstract loadHead(manager?: EntityManager): Promise<number|null>
    protected abstract saveHead(head: number,  manager?: EntityManager): Promise<void>
    protected abstract bornAt(): Promise<number>
    protected abstract processBlock(
        blockNum: number,
        manager: EntityManager,
        saveSnapshot?: boolean
    ): Promise<number>
    protected abstract async latestTrunkCheck(): Promise<void>

    protected async getHead() {
        if (this.head !== null) {
            return this.head
        } else {
            const head = await this.loadHead()

            if (head === null) {
                return this.birthNumber! - 1
            } else {
                return head
            }

        }
    }

    protected async processGenesis(): Promise<void> {
        return
    }

    protected enoughToWrite(count: number) {
        return !!count
    }

    private async beforeStart() {
        this.birthNumber = await this.bornAt()
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
                if (head === this.birthNumber! - 1) {
                    await this.processGenesis()
                }

                const best = await getBest()

                if (best.number <= head) {
                    continue
                }
                if (best.number - head > REVERSIBLE_WINDOW) {
                    await this.fastForward(best.number - REVERSIBLE_WINDOW)
                    head = await this.getHead()
                }
                await getConnection().transaction(async (manager) => {
                    for (let i = head + 1; i <= best.number; i++) {
                        await this.processBlock(i, manager, true)
                    }
                    await this.saveHead(best.number, manager)
                    console.log('-> save head:', best.number)
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
                    process.stderr.write(`processor(${this.constructor.name}) loop: ` + (e as Error).stack + '\r\n')
                }
            }
        }
    }

    private async fastForward(target: number) {
        const head = await this.getHead()

        let startNum = head + 1
        console.time('time')
        let count = 0
        for (let i = head + 1 ; i <= target;) {
            await getConnection().transaction(async (manager) => {
                for (; i <= target;) {
                    if (this.shutdown) {
                        throw new InterruptedError()
                    }

                    count += await this.processBlock(i++, manager)
                    if (this.enoughToWrite(count)) {
                        await this.saveHead(i - 1, manager)
                        count = 0
                        if ((i - startNum) >= 1000) {
                            process.stdout.write(`imported blocks(${i - startNum}) at block(${i - 1}) `)
                            console.timeEnd('time')
                            console.time('time')
                            startNum = i
                        }
                        break
                    }

                    if (i === target + 1) {
                        await this.saveHead(i - 1, manager)
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${i - 1}) `)
                        console.timeEnd('time')
                        break
                    }
                }
            })
            this.head = i - 1
        }
    }
}
