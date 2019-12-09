import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { blockIDtoNum, displayID } from '../../utils'
import { EnergyAddress, TransferEvent, getPreAllocAccount, Network, prototype } from '../../const'
import { getConnection, EntityManager } from 'typeorm'
import { BlockProcessor, SnapAccount } from './block-processor'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { Account } from '../../explorer-db/entity/account'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { insertSnapshot, clearSnapShot, removeSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { Processor } from '../processor'
import { AssetType, SnapType } from '../../explorer-db/types'
import { getBlockByNumber, getBlockReceipts, getBlockTransactions } from '../../service/block'

export class DualToken extends Processor {
    private persist: Persist

    constructor(readonly thor: Thor) {
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
        return SnapType.DualToken
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const block = (await getBlockByNumber(blockNum, manager))!
        const receipts = await getBlockReceipts(block.id, manager)
        const txs = await getBlockTransactions(block.id, manager)

        const proc = new BlockProcessor(block, this.thor, manager)
        for (const r of receipts) {
            for (const [clauseIndex, o] of r.outputs.entries()) {
                for (const [logIndex, t] of o.transfers.entries()) {

                    const transfer = manager.create(AssetMovement, {
                        ...t,
                        amount: BigInt(t.amount),
                        txID: r.txID,
                        blockID: block.id,
                        type: AssetType.VET,
                        moveIndex: {
                            txIndex: r.txIndex,
                            clauseIndex,
                            logIndex
                        }
                    })

                    await proc.transferVeChain(transfer)
                }
                for (const [logIndex, e] of o.events.entries()) {
                    if (e.topics[0] === prototype.$Master.signature) {
                        const decoded = prototype.$Master.decode(e.data, e.topics)
                        await proc.master(e.address, decoded.newMaster)
                    } else if (e.topics[0] === prototype.$Sponsor.signature) {
                        const decoded = prototype.$Sponsor.decode(e.data, e.topics)
                        if (decoded.action === prototype.selected) {
                            await proc.sponsorSelected(e.address, decoded.sponsor)
                        } else if (decoded.action === prototype.unsponsored) {
                            await proc.sponsorUnSponsored(e.address, decoded.sponsor)
                        }
                    } else if (e.address === EnergyAddress && e.topics[0] === TransferEvent.signature) {
                        const decoded = TransferEvent.decode(e.data, e.topics)
                        const transfer = manager.create(AssetMovement, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: r.txID,
                            blockID: block.id,
                            type: AssetType.VTHO,
                            moveIndex: {
                                txIndex: r.txIndex,
                                clauseIndex,
                                logIndex
                            }
                        })

                        await proc.transferEnergy(transfer)
                    }
                }
            }
            await proc.touchEnergy(r.gasPayer)
            await proc.increaseTxCount(txs[r.txIndex].origin)
        }
        if (receipts.length) {
            await proc.touchEnergy(block.beneficiary)
        }
        await proc.finalize()

        if (proc.Movement.length) {
            await this.persist.insertMovements(proc.Movement, manager)
        }

        const accs = proc.accounts()
        if (accs.length) {
            await this.persist.saveAccounts(accs, manager)
        }

        const snap = proc.snapshot()
        if (saveSnapshot) {
            await insertSnapshot(snap, manager)
        }

        return proc.Movement.length + accs.length
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < 12) {
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
                await this.revertSnapshot(snapshots)
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

    protected async processGenesis() {
        const block = (await getBlockByNumber(0))!

        await getConnection().transaction(async (manager) => {
            const proc = new BlockProcessor(block, this.thor, manager)

            for (const addr of getPreAllocAccount(block.id as Network)) {
                await proc.genesisAccount(addr)
            }

            await proc.finalize()
            await this.persist.saveAccounts(proc.accounts(), manager)
            await this.saveHead(0, manager)
        })
        this.head = 0
    }

    private async revertSnapshot(snapshots: Snapshot[]) {
        const headNum = blockIDtoNum(snapshots[0].blockID) - 1
        const headID = snapshots[0].blockID
        const toRevert = snapshots.map(x => x.blockID)
        await getConnection().transaction(async (manager) => {
            const accounts = new Map<string, Account>()

            for (; snapshots.length;) {
                const snap = snapshots.pop()!
                if (snap.data) {
                    for (const snapAcc of snap.data as SnapAccount[]) {
                        const acc = manager.create(Account, {
                            address: snapAcc.address,
                            balance: BigInt(snapAcc.balance),
                            energy: BigInt(snapAcc.energy),
                            blockTime: snapAcc.blockTime,
                            txCount: snapAcc.txCount,
                            code: snapAcc.code,
                            master: snapAcc.master
                        })
                        accounts.set(snapAcc.address, acc)
                    }
                }
            }

            const toSave: Account[] = []
            for (const [_, acc] of accounts.entries()) {
                toSave.push(acc)
                console.log(`Account(${acc.address}) reverted to VET(${acc.balance}) Energy(${acc.balance}) BlockTime(${acc.blockTime}) at Block(${displayID(headID)})`)
            }

            await this.persist.saveAccounts(toSave, manager)
            await this.persist.removeMovements(toRevert, manager)
            await removeSnapshot(toRevert, this.snapType, manager)
            await this.saveHead(headNum, manager)
            console.log('-> revert to head:', headNum)
        })
        this.head = headNum
    }

}
