import { EntityManager, getConnection } from 'typeorm'
import { PromInt } from '@vechain/connex.driver-nodejs/dist/promint'
import { sleep, REVERSIBLE_WINDOW } from '../utils'
import { getBest } from '../foundation/db'
import { EventEmitter } from 'events'

export abstract class Processor {
    protected head: number | null = null
    private birthNumber: number | null = null
    private shutdown = false
    private init = new PromInt()
    private ev = new EventEmitter()

    public start() {
        this.loop()
    }

    public stop(): Promise<void> {
        this.shutdown = true
        this.init.interrupt()

        return new Promise((resolve) => {
            this.ev.on('closed', resolve)
        })
    }

    protected abstract loadHead(manager?: EntityManager): Promise<number>
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

            if (!head) {
                return this.birthNumber - 1
            } else {
                return head
            }

        }
    }

    protected async processGenesis(): Promise<void> {
        return
    }

    private async loop() {
        this.birthNumber = await this.bornAt()

        for (; ;) {
            if (this.shutdown) {
                this.ev.emit('closed')
                break
            }
            await sleep(5 * 1000)
            try {
                await this.latestTrunkCheck()

                let head = await this.getHead()
                if (head === this.birthNumber - 1) {
                    await this.processGenesis()
                }

                const best = await getBest()
                // const best = wait this.persist.getBlock(700000)

                if (best.number <= head) {
                    continue
                }
                if (best.number - head > REVERSIBLE_WINDOW) {
                    await this.fastForward(best.number - REVERSIBLE_WINDOW)
                    head = await this.getHead()
                }
                await getConnection().transaction(async (manager) => {
                    for (let i = head + 1; i <= best.number; i++) {
                        await this.init.wrap(this.processBlock(i, manager, true))
                    }
                    await this.saveHead(best.number, manager)
                })
                this.head = best.number
            } catch (e) {
                console.log(`processor(${this.constructor.name}) loop:`, e)
            }
        }
    }

    private async fastForward(target: number) {
        const head = await this.getHead()

        let count = 0

        for (let i = head + 1; i <= target;) {
            const startNum = i
            console.time('time')
            await getConnection().transaction(async (manager) => {
                for (; i <= target;) {
                    count += await this.init.wrap(this.processBlock(i++, manager))

                    if (count >= 5000) {
                        await this.saveHead(i - 1, manager)
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${i - 1}) `)
                        console.timeEnd('time')
                        count = 0
                        break
                    }

                    if (i === target + 1) {
                        await this.saveHead(i - 1, manager)
                        process.stdout.write(`processed blocks(${i - startNum}) at block(${i - 1}) `)
                        console.timeEnd('time')
                        break
                    }

                }
            })
            this.head = i - 1
        }
    }
}