import { BlockSummary, Fork } from 'chain-observer'

export interface Subscriber {
    notifyNewHeads(heads: BlockSummary[]): void
    notifyFork(f: Fork): void
}
