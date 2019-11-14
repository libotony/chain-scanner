import { Thor } from '../thor-rest'
import { Persist } from './persist'
import { getConnection } from 'typeorm'
import { blockIDtoNum, displayID, REVERSIBLE_WINDOW, sleep } from '../utils'
import { EventEmitter } from 'events'
import { PromInt, InterruptedError } from '@vechain/connex.driver-nodejs/dist/promint'
import { getBlockByID } from '../service/block'

const SAMPLING_INTERVAL = 1 * 1000

export class Foundation {
    private head: string | null = null
    private persist: Persist
    private shutdown = false
    private init = new PromInt()
    private ev = new EventEmitter()

    constructor(readonly thor: Thor) {
        this.persist = new Persist()
    }

    public start() {
        this.loop()
        return
    }

    public stop() {
        this.shutdown = true
        this.init.interrupt()

        return new Promise((resolve) => {
            this.ev.on('closed', resolve)
        })
    }

    private async latestTrunkCheck() {
        const head = await this.getHead()

        if (head === '') {
            return
        }

        const headNum = blockIDtoNum(head)
        if ( headNum < REVERSIBLE_WINDOW) {
            return
        }

        let newHead: string = null
        const blocks = await this.init.wrap(this.persist.listRecentBlock(headNum))
        if (blocks.length) {
            await getConnection().transaction(async (manager) => {
                const func = async () => {
                    const toBranch: string[] = []
                    const toTrunk: string[] = []

                    for (const b of blocks) {
                        const chainB = await this.thor.getBlock(b.id)
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
                        console.log('-> revert to head:', displayID(current.id))
                        newHead = current.id
                    }
                }
                await this.init.wrap(func())
            })
            if (newHead) {
                this.head = newHead
            }
        }
    }

    private async loop() {
        for (; ;) {
            if (this.shutdown) {
                this.ev.emit('closed')
                break
            }
            try {
                await this.init.wrap(sleep(SAMPLING_INTERVAL))
                await this.latestTrunkCheck()

                let head = await this.getHead()
                const best = await this.thor.getBlock('best')

                if (head === best.id) {
                    continue
                }
                if (head === '' || blockIDtoNum(head) < best.number - REVERSIBLE_WINDOW) {
                    await this.fastForward(best.number - REVERSIBLE_WINDOW)
                }

                head = await this.getHead()

                if (best.parentID === head) {
                    await getConnection().transaction(async (manager) => {
                        await this.init.wrap(this.persist.insertBlock(best, this.thor, manager))
                        await this.init.wrap(this.persist.saveHead(best.id, manager))
                        console.log('-> save head:', displayID(best.id))
                    })
                    this.head = best.id
                } else {
                    const headBlock = await this.init.wrap(this.thor.getBlock(head))
                    const { trunk, branch } = await this.init.wrap(this.buildFork(best, headBlock))

                    await getConnection().transaction(async (manager) => {
                        const func = async () => {
                            const toBranch: string[] = []
                            const toTrunk: string[] = []

                            for (const b of branch) {
                                const tmp = await getBlockByID(b.id, manager)
                                if (!tmp) {
                                    await this.persist.insertBlock(b, this.thor, manager, false)
                                } else if (tmp.isTrunk) {
                                    toBranch.push(tmp.id)
                                }
                            }
                            for (const b of trunk) {
                                const tmp = await getBlockByID(b.id, manager)
                                if (!tmp) {
                                    await this.persist.insertBlock(b, this.thor, manager)
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

                            await this.persist.saveHead(best.id, manager)
                            console.log('-> save head:', displayID(best.id))
                        }

                        await this.init.wrap(func())
                    })
                    this.head = best.id
                }
            } catch (e) {
                if (!(e instanceof InterruptedError)) {
                    console.log(`foundation loop:`, e)
                }
            }
        }
    }

    private async buildFork(trunkHead: Required<Connex.Thor.Block>, branchHead: Required<Connex.Thor.Block>) {
        let t = trunkHead
        let b = branchHead

        const branch: Array<Required<Connex.Thor.Block>> = []
        const trunk: Array<Required<Connex.Thor.Block>> = []

        for (; ;) {
            if (t.number > b.number) {
                trunk.push(t)
                t = await this.thor.getBlock(t.parentID)
                continue
            }

            if (t.number < b.number) {
                branch.push(b)
                b = await this.thor.getBlock(b.parentID)
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

            t = await this.thor.getBlock(t.parentID)
            b = await this.thor.getBlock(b.parentID)
        }

    }

    private async getHead(): Promise < string > {
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

    private async fastForward(target: number) {
        const head = await this.getHead()
        const headNum = head ? blockIDtoNum(head) : -1

        let count = 0
        let b: Required<Connex.Thor.Block>

        for (let i = headNum + 1; i <= target;) {
            const startNum = i
            console.time('time')
            await getConnection().transaction(async (manager) => {
                for (; i <= target;) {
                    if (this.shutdown) {
                        throw new InterruptedError()
                    }
                    b = await this.init.wrap(this.thor.getBlock(i++))
                    count += await this.init.wrap(this.persist.insertBlock(b, this.thor, manager))

                    if (count >= 5000) {
                        await this.init.wrap(this.persist.saveHead(b.id, manager))
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${displayID(b.id)}) `)
                        console.timeEnd('time')
                        count = 0
                        break
                    }

                    if (i === target + 1) {
                        await this.init.wrap(this.persist.saveHead(b.id, manager))
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${displayID(b.id)}) `)
                        console.timeEnd('time')
                        break
                    }
                }
            })
            this.head = b.id
        }
    }

}
