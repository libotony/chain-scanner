import StrictEventEmitter from 'strict-event-emitter-types'
import { EventEmitter } from 'events'
import { Thor } from './thor-rest'
import { BlockSummary } from './types'
import { Fork } from 'chain-observer'
import { sleep } from './utils'

interface WatcherEvents {
    NewHeads: (heads: BlockSummary[]) => void
    Fork: (fork: Fork) => void
}

const SAMPLING_INTERVAL = 1 * 1000

export class ChainWatcher extends (EventEmitter as new () => StrictEventEmitter<EventEmitter, WatcherEvents>) {
    private head: BlockSummary |null = null

    constructor(readonly thor: Thor) {
        super()
        this.trackLoop()
    }

    private async trackLoop() {
        for (; ;) {
            try {
                await sleep(SAMPLING_INTERVAL)
                const newHead = await this.getBlockSummary()
                if (newHead) {
                    if (this.head === null) {
                        this.emit('NewHeads', [newHead])
                    } else {
                        if (newHead.parentID === this.head.id) {
                            this.emit('NewHeads', [newHead])
                        } else {
                            const fork = await this.buildFork(newHead, this.head)
                            if (fork.branch.length === 0 && fork.trunk.length) {
                                this.emit('NewHeads', fork.trunk)
                            } else if (fork.branch.length) {
                                this.emit('Fork', fork)
                            }
                        }
                    }
                    this.head = { ...newHead }
                }
            } catch (e) {
                console.log('Watcher.trackerLoop ', e)
                continue
            }
        }
    }

    private async getBlockSummary(revision?: string | number | 'best', optimistic = false): Promise<BlockSummary|null> {
        const b = await this.thor.getBlock(revision ? revision : 'best')
        if (b === null) {
            if (optimistic) {
                throw new Error('Failed to get block: ' + revision)
            } else {
                return null
            }
        } else {
            return {
                id: b.id,
                number: b.number,
                timestamp: b.timestamp,
                parentID: b.parentID,
            }
        }
    }

    private async buildFork(trunkHead: BlockSummary, branchHead: BlockSummary): Promise<Fork> {
        let t = trunkHead
        let b = branchHead

        const branch: BlockSummary[] = []
        const trunk: BlockSummary[] = []

        for (; ;) {
            if (t.number > b.number) {
                trunk.push(t)
                t = await this.getBlockSummary(t.parentID, true)
                continue
            }

            if (t.number < b.number) {
                branch.push(b)
                b = await this.getBlockSummary(b.parentID, true)
                continue
            }

            if (t.id === b.id) {
                return {
                    ancestor: t,
                    trunk: trunk.reverse(),
                    branch: branch.reverse(),
                }
            }

            trunk.push(t)
            branch.push(b)

            t = await this.getBlockSummary(t.parentID, true)
            b = await this.getBlockSummary(b.parentID, true)
        }

    }

}
