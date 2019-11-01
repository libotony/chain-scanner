import { Thor } from '../thor-rest'
import { BlockSummary, Fork } from '../types'
import { Persist } from './persist'
import { getConnection } from 'typeorm'
import { blockIDtoNum, displayID, REVERSIBLE_WINDOW } from '../utils'
import { EventEmitter } from 'events'
import { PromInt, InterruptedError } from '@vechain/connex.driver-nodejs/dist/promint'

export interface Task<T extends 'NewHeads' | 'Fork' | 'StartUp'> {
    type: T,
    data: T extends 'NewHeads' ? BlockSummary[] : T extends 'Fork' ? Fork : undefined
}

export class Foundation {
    private running: boolean = false
    private head: string | null = null
    private tasks: Array<Task<'NewHeads' | 'Fork' | 'StartUp'>> = []
    private persist: Persist
    private shutdown = false
    private init = new PromInt()
    private ev = new EventEmitter()

    constructor(readonly thor: Thor) {
        this.persist = new Persist()
    }

    public startUp() {
        this.tasks.push({type: 'StartUp', data: undefined})
        this.run()
    }

    public newHeads(heads: BlockSummary[]) {
        this.tasks.push({type: 'NewHeads', data: heads})
        this.run()
        return
    }

    public fork(f: Fork) {
        this.tasks.push({ type: 'Fork', data: f })
        this.run()
        return
    }

    public stop() {
        if (this.running === false) {
            return Promise.resolve()
        }
        this.shutdown = true
        this.init.interrupt()

        return new Promise((resolve) => {
            this.ev.on('closed', resolve)
        })
    }

    private async run() {
        if (this.running) { return }
        this.running = true

        if (this.shutdown) {
            this.ev.emit('closed')
            return
        }
        for (; this.tasks.length;) {
            if (this.shutdown) {
                this.ev.emit('closed')
                break
            }
            try {
                const task = this.tasks.shift()

                switch (task.type) {
                    case 'StartUp':
                        await this.latestTrunkCheck()
                        break
                    case 'NewHeads':
                        const heads = (task as Task<'NewHeads'>).data
                        await this.blockContinuity(heads[0])

                        await getConnection().transaction(async (manager) => {
                            for (const h of heads) {
                                const b = await this.thor.getBlock(h.id)
                                await this.init.wrap(this.persist.insertBlock(b, this.thor, manager))
                            }

                            await this.persist.saveHead(heads[heads.length - 1].id, manager)
                        })
                        this.head = heads[heads.length - 1].id
                        break
                    case 'Fork':
                        const f = (task as Task<'Fork'>).data

                        const head = await this.getHead()
                        if (blockIDtoNum(head) < f.trunk[0].number) {
                            await this.blockContinuity(f.trunk[0])
                        }

                        const blockIDs = f.branch.map(i => i.id)
                        await getConnection().transaction(async (manager) => {
                            await this.persist.toBranch(blockIDs, manager)

                            for (const h of f.trunk) {
                                const b = await this.thor.getBlock(h.id)
                                await this.init.wrap(this.persist.insertBlock(b, this.thor, manager))
                            }

                            await this.persist.saveHead(f.trunk[f.trunk.length - 1].id, manager)
                        })
                        this.head = f.trunk[f.trunk.length - 1].id
                        break
                }
            } catch (e) {
                console.log('foundation loop: ', e)
                continue
            }
        }
        this.running = false
    }

    private async getHead(): Promise<string> {
        if (this.head !== null) {
            return this.head
        } else {
            const config = await this.persist.getHead()

            const freshStartPoint = ''
            // const freshStartPoint =  '0x003d08ffd2683df6555f0e3480bde578f8feede131650c3af01b534d234a921e'
            if (!config) {
                return freshStartPoint
            } else {
                return  config.value
            }
        }
    }

    private async latestTrunkCheck() {
        const head = await this.getHead()

        if (head === '') {
            return
        }

        const bs: Connex.Thor.Block[] = []

        let branchIndex = -1
        for (let i = 0; i < REVERSIBLE_WINDOW; i++) {
            const b = await this.thor.getBlock(i === 0 ? head : bs[bs.length - 1].parentID)
            bs.push(b)
            if (!b.isTrunk) {
                branchIndex = i
            }
        }

        if (branchIndex !== -1) {
            const branchIDs = bs.slice(0, branchIndex + 1).map(x => x.id)
            await getConnection().transaction(async (manager) => {
                await this.persist.toBranch(branchIDs, manager)
                await this.persist.saveHead(bs[branchIndex].parentID, manager)
            })
            this.head = bs[branchIndex].parentID
        }
    }

    private async blockContinuity(stopPos: BlockSummary) {
        let head = await this.getHead()
        const headNum = head ? blockIDtoNum(head) : -1

        if (stopPos.number - headNum > REVERSIBLE_WINDOW) {
            await this.fastForward(stopPos.number - REVERSIBLE_WINDOW)
        }
        head = await this.getHead()

        if (blockIDtoNum(head) === stopPos.number - 1) {
            return
        } else if (blockIDtoNum(head) >= stopPos.number) {
            throw new Error('Head greater than new trunk, drop first')
        }

        const blocks: Array<Required<Connex.Thor.Block>> = []
        let parentID = stopPos.parentID
        for (let i = 0; i < REVERSIBLE_WINDOW - 1; i++) {
            if (blockIDtoNum(parentID) <= blockIDtoNum(head)) {
                break
            }
            const b = await this.thor.getBlock(parentID)
            blocks.push(b)
            parentID = b.parentID
        }

        if (parentID !== head) {
            throw new Error(`Fatal: block continuity broke, want ${head} got ${parentID}`)
        }

        await getConnection().transaction(async (manager) => {
            for (; blocks.length;) {
                const b = blocks.pop()
                await this.init.wrap(this.persist.insertBlock(b, this.thor, manager))
            }
            await this.persist.saveHead(stopPos.parentID, manager)
        })
        this.head = stopPos.parentID
        return this.head
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
                    b = await this.thor.getBlock(i++)
                    count += await this.init.wrap(this.persist.insertBlock(b, this.thor, manager))

                    if (count >= 5000) {
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
            this.head = b.id
        }
    }

}
