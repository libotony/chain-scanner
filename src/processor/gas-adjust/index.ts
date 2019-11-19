import { SnapType } from '../../explorer-db/types'
import { EntityManager, getConnection, LessThan, In } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByNumber, getBlockByID } from '../../explorer-db/service/block'
import { Config } from '../../explorer-db/entity/config'
import { Block } from '../../explorer-db/entity/block'
import { GasAdjustment } from '../../explorer-db/entity/gas-adjust'
import { insertSnapshot, listRecentSnapshot, removeSnapshot, clearSnapShot } from '../snapshot'
import { blockIDtoNum } from '../../utils'

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
    getLastBlockBySignerAndBlockNumber: (num: number, signer: string, manager?: EntityManager) => {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Block)
            .createQueryBuilder('block')
            .where({ number: LessThan(num), signer })
            .orderBy('number', 'DESC')
            .limit(1)
            .getOne()
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
            .delete({ blockID: In(ids) })
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

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const block = (await getBlockByNumber(blockNum, manager))!
        const parentBlock = (await getBlockByID(block.parentID, manager))!

        if (block.gasLimit !== parentBlock.gasLimit) {
            const prevBlock = await persist.getLastBlockBySignerAndBlockNumber(block.number, block.signer, manager)
            if (prevBlock) {
                const adjustment = manager.create(GasAdjustment, {
                    blockID: block.id,
                    prevBlock: prevBlock.id,
                    gasDiff: block.gasLimit - prevBlock.gasLimit
                })
                await persist.insertAdjustment(adjustment)

                if (saveSnapshot) {
                    const snap = manager.create(Snapshot, {
                        blockID: block.id,
                        type: SnapType.GasAdjustment,
                        data: null
                    })
                    await insertSnapshot(snap, manager)
                }
                return 1
            }
        }

        return 0
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < 12) {
            return
        }

        const snapshots = await listRecentSnapshot(head, SnapType.GasAdjustment)

        if (snapshots.length) {
            for (; snapshots.length;) {
                if (snapshots[0].isTrunk === false) {
                    break
                }
                snapshots.shift()
            }
            if (snapshots.length) {
                const headNum = blockIDtoNum(snapshots[0].blockID) - 1
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {
                    await persist.removeAdjustments(toRevert)
                    await removeSnapshot(toRevert, SnapType.Authority, manager)
                    await this.saveHead(headNum, manager)
                    console.log('-> revert to head:', headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, SnapType.GasAdjustment)
    }

}
