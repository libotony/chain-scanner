import { SnapType, AssetType } from '../../explorer-db/types'
import { EntityManager, getConnection, LessThan, In, Between } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByNumber } from '../../service/block'
import { Config } from '../../explorer-db/entity/config'
import { insertSnapshot, listRecentSnapshot, removeSnapshot, clearSnapShot } from '../../service/snapshot'
import { blockIDtoNum, REVERSIBLE_WINDOW, sleep } from '../../utils'
import { BuybackHacker } from '../../explorer-db/entity/buyback-hacker'
import { Account } from '../../explorer-db/entity/account'
import { AssetMovement } from '../../explorer-db/entity/movement'

const HEAD_KEY = 'buyback-incident-watcher-head'
const aliasPrefix = 'buyback-hacker '
const firstHacker = '0xd802a148f38aba4759879c33e8d04deb00cfb92b'

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
    getDualTokenHead: async (manager: EntityManager): Promise<number | null> => {
        const head = await manager
            .getRepository(Config)
            .findOne({ key: 'dual-token-head' })

        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    },
    getBlockTransfers: (blockID: string, manager: EntityManager) => {
        return manager
            .getRepository(AssetMovement)
            .find({
                type: In([AssetType.VET, AssetType.VTHO]),
                blockID
            })
    },
    getHackerAddress: (address: string, manager: EntityManager) => {
        return manager
            .getRepository(BuybackHacker)
            .findOne({address})
    },
    getAccount: (address: string, manager: EntityManager) => {
        return manager
            .getRepository(Account)
            .findOne({address})
    },
    updateAlias: (address: string, alias: string, manager: EntityManager) => {
        return manager
            .getRepository(Account)
            .update({address}, {alias})
    },
    resetAlias: (addresses: string[], manager: EntityManager) => {
        return manager
            .getRepository(Account)
            .update({address: In(addresses)}, {alias: null})
    },
    removeHackers: (addresses: string[], manager: EntityManager) => {
        return manager
            .getRepository(BuybackHacker)
            .delete({address: In(addresses)})
    }
}

export class BuybackIncidentWatcher extends Processor {

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
        return Promise.resolve(4578946)
    }

    protected get snapType() {
        return SnapType.BuyBackHacker
    }

    protected async processGenesis() {
        await getConnection().transaction(async (manager) => {
            const acc = new BuybackHacker()
            acc.address = firstHacker

            await manager.save(BuybackHacker, acc)
            await persist.updateAlias(firstHacker, aliasPrefix + '(first)', manager)
        })
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const dualTokenHead = await persist.getDualTokenHead(manager)
        if (dualTokenHead === null || dualTokenHead < blockNum) {
            process.stdout.write('waiting for dual token process\r\n')
            return 0
        }

        const block = (await getBlockByNumber(blockNum, manager))!
        const transfers = await persist.getBlockTransfers(block.id, manager)
        const addresses: string[] = []

        if (transfers.length) {
            for (const tr of transfers) {
                const sender = await persist.getHackerAddress(tr.sender, manager)
                const recipient = await persist.getHackerAddress(tr.recipient, manager)
                if (sender && !recipient) {
                    const acc = new BuybackHacker()
                    acc.address = tr.recipient

                    console.log(`new address(${acc.address}) at Block(${blockNum})`)

                    await manager.save(BuybackHacker, acc)
                    await persist.updateAlias(tr.recipient, aliasPrefix, manager)
                    addresses.push(tr.recipient)
                }
            }
        }

        if (saveSnapshot) {
            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = this.snapType
            if (addresses.length) {
                snapshot.data = addresses
            } else {
                snapshot.data = null
            }
            await insertSnapshot(snapshot, manager)
        }

        return addresses.length

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
                    let addr: string[] = []
                    for (; snapshots.length;) {
                        const snap = snapshots.pop()!
                        if (snap.data) {
                            addr = addr.concat(snap.data as string[])
                        }
                    }
                    if (addr.length) {
                        await persist.removeHackers(addr, manager)
                        await persist.resetAlias(addr, manager)
                    }

                    await removeSnapshot(toRevert, this.snapType, manager)
                    await this.saveHead(headNum, manager)
                    console.log('-> revert to head:', headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

}
