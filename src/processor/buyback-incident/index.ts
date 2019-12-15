import { SnapType, AssetType } from '../../explorer-db/types'
import { EntityManager, getConnection, In } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByNumber } from '../../service/block'
import { Config } from '../../explorer-db/entity/config'
import { insertSnapshot, listRecentSnapshot, removeSnapshot, clearSnapShot } from '../../service/snapshot'
import { blockIDtoNum, REVERSIBLE_WINDOW } from '../../utils'
import { BuybackTheft } from '../../explorer-db/entity/buyback-theft'
import { Account } from '../../explorer-db/entity/account'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { KnowExchange } from '../../const'

const HEAD_KEY = 'buyback-incident-watcher-head'
const aliasPrefix = 'buyback-theft '
const buybackAddress = '0xcbb08415335623a838e27d22ac7fdf8a370af064'

const theftOwned = [
    '0xf1cab8176f6df208468fd592e37fdafca4d96bd2',
    '0xbe3d5f8f926715e261d4ba14cff07b64d781609a',
    '0x91303fa67bd27408fcac1ad50b20f7c2d5a1426b',
    '0xbf781d431172bf6d6eccfb9d5d318972470e60f7',
    '0xd802a148f38aba4759879c33e8d04deb00cfb92b',
]

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
    getTheftAddress: (address: string, manager: EntityManager) => {
        return manager
            .getRepository(BuybackTheft)
            .findOne({ address })
    },
    getAccount: (address: string, manager: EntityManager) => {
        return manager
            .getRepository(Account)
            .findOne({ address })
    },
    updateAlias: (address: string, alias: string, manager: EntityManager) => {
        return manager
            .getRepository(Account)
            .update({ address }, { alias })
    },
    resetAlias: (addresses: string[], manager: EntityManager) => {
        return manager
            .getRepository(Account)
            .update({ address: In(addresses) }, { alias: null })
    },
    removeThefts: (addresses: string[], manager: EntityManager) => {
        return manager
            .getRepository(BuybackTheft)
            .delete({ address: In(addresses) })
    },
    getTheftAddressCount: (manager: EntityManager) => {
        return manager
            .getRepository(BuybackTheft)
            .count()
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
        return SnapType.BuybackTheft
    }

    protected async processGenesis() {
        await getConnection().transaction(async (manager) => {
            let acc = manager.create(BuybackTheft, { address: buybackAddress })
            await manager.save(BuybackTheft, acc)
            await persist.updateAlias(buybackAddress, 'buyback(stolen)', manager)

            let i = 1
            for (const addr of theftOwned) {
                acc = manager.create(BuybackTheft, { address: addr })
                await manager.save(BuybackTheft, acc)
                await persist.updateAlias(addr, aliasPrefix + (i++), manager)
            }

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
                const sender = await persist.getTheftAddress(tr.sender, manager)
                const recipient = await persist.getTheftAddress(tr.recipient, manager)

                if (sender) {
                    console.log(`new transfer: From(${tr.sender}) To(${tr.recipient}) Value(${tr.amount} ${AssetType[tr.type]})`)
                    if (!recipient) {
                        if (KnowExchange.has(tr.recipient)) {
                            // Transferring to exchange
                            console.log(`!!Caution: suspicious transfer to ${KnowExchange.get(tr.recipient)}`)
                        } else {
                            const recipientAcc = (await persist.getAccount(tr.recipient, manager))!
                            // first seen in 12 blocks will be considered newly created
                            if (recipientAcc.firstSeen < block.timestamp - 12 * 10) {
                                console.log(`new Recipient(${tr.recipient}) which is first seen at 12 blocks away(${new Date(recipientAcc.firstSeen * 1000).toLocaleString()}), ignore first`)
                            } else {
                                const count = await persist.getTheftAddressCount(manager)
                                const acc = manager.create(BuybackTheft, { address: tr.recipient })
                                await manager.save(BuybackTheft, acc)
                                await persist.updateAlias(tr.recipient, aliasPrefix + count, manager)
                                console.log(`new address(${tr.recipient}) at Block(${blockNum})`)
                                addresses.push(tr.recipient)
                            }
                        }
                    }
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
                        await persist.removeThefts(addr, manager)
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
