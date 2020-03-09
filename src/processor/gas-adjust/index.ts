import { SnapType } from '../../explorer-db/types'
import { EntityManager, getConnection, LessThan, In } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByNumber, getBlockByID } from '../../service/block'
import { Config } from '../../explorer-db/entity/config'
import { GasAdjustment } from '../../explorer-db/entity/gas-adjust'
import { insertSnapshot, listRecentSnapshot, removeSnapshot, clearSnapShot } from '../../service/snapshot'
import { blockIDtoNum, REVERSIBLE_WINDOW } from '../../utils'
import * as logger from '../../logger'

const HEAD_KEY = 'gas-adust-watcher-head'

const persist = {
    saveHead: (val: number, manager?: EntityManager) => {
        if (!manager) {
            manager = getConnection().manager
        }

        const config = new Config()
        config.key = HEAD_KEY
        config.value = val.toString()

        return manager.save(config)
    },
    getHead: async (manager?: EntityManager): Promise<number | null> => {
        if (!manager) {
            manager = getConnection().manager
        }

        const head = await manager
            .getRepository(Config)
            .findOne({ key: HEAD_KEY })
        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    },
    insertAdjustment: (adj: GasAdjustment, manager?: EntityManager) => {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(GasAdjustment, adj)
    },
    removeAdjustments: (ids: string[], manager?: EntityManager) => {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(GasAdjustment)
            .delete({ blockID: In([...ids]) })
    }
}

export class GasAdjustmentWatcher extends Processor {

    constructor() {
        super()
     }

    protected loadHead(manager?: EntityManager) {
        return persist.getHead(manager)
    }

    protected async saveHead(head: number, manager?: EntityManager) {
        await persist.saveHead(head, manager)
        return
    }

    protected bornAt() {
        return Promise.resolve(1)
    }

    protected get snapType() {
        return SnapType.GasAdjustment
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const block = (await getBlockByNumber(blockNum, manager))!
        const parentBlock = (await getBlockByID(block.parentID, manager))!

        if (block.gasLimit !== parentBlock.gasLimit) {
            const adjustment = manager.create(GasAdjustment, {
                blockID: block.id,
                gasChanged: block.gasLimit - parentBlock.gasLimit
            })
            await persist.insertAdjustment(adjustment, manager)

            if (saveSnapshot) {
                const snap = manager.create(Snapshot, {
                    blockID: block.id,
                    type: this.snapType,
                    data: null
                })
                await insertSnapshot(snap, manager)
            }
            return 1
        }

        return 0
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < REVERSIBLE_WINDOW) {
            return
        }

        const snapshots = await listRecentSnapshot(head, this.snapType)

        if (snapshots.length) {
            for (; snapshots.length;) {
                if (snapshots[0].block.isTrunk === false) {
                    break
                }
                snapshots.shift()
            }
            if (snapshots.length) {
                const headNum = blockIDtoNum(snapshots[0].blockID) - 1
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {
                    await persist.removeAdjustments(toRevert, manager)
                    await removeSnapshot(toRevert, this.snapType, manager)
                    await this.saveHead(headNum, manager)
                    logger.log('-> revert to head:' + headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

}
