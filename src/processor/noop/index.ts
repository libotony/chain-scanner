import { SnapType } from '../../explorer-db/types'
import { Persist } from './persist'
import { EntityManager } from 'typeorm'
import { Processor } from '../processor'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { Block } from '../../explorer-db/entity/block'

export class Noop extends Processor {
    private persist: Persist

    constructor(
    ) {
        super()
        this.persist = new Persist()
    }

    protected loadHead(manager?: EntityManager) {
        return this.persist.getHead(manager)
    }

    protected async saveHead(head: number, manager?: EntityManager) {
        await this.persist.saveHead(head, manager)
        return
    }

    protected bornAt() {
        return Promise.resolve(0)
    }

    protected get snapType() {
        return 4 as SnapType
    }


    protected get skipEmptyBlock() {
        return true
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, saveSnapshot = false) {
        return 1 + txs.length
    }

    protected async latestTrunkCheck() {
        return
    }

    protected async processGenesis() {
        return
    }

}
