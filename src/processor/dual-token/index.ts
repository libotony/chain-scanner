import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { blockIDtoNum } from '../../utils'
import { $Master, EnergyAddress, TransferEvent, getPreAllocAccount } from '../../const'
import { getConnection, EntityManager } from 'typeorm'
import { BlockProcessor, SnapAccount } from './block-processor'
import { AssetMovement } from '../../db/entity/movement'
import { Account } from '../../db/entity/account'
import { Snapshot } from '../../db/entity/snapshot'
import { getBlockReceipts, getBlock } from '../../foundation/db'
import { Processor } from '../processor'
import { AssetType } from '../../types'

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

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const { block, receipts } = await getBlockReceipts(blockNum, manager)

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
                    if (e.topics[0] === $Master.signature) {
                        const decoded = $Master.decode(e.data, e.topics)
                        await proc.master(e.address, decoded.newMaster)
                    } else if (e.address === EnergyAddress && e.topics[0] === TransferEvent.signature) {
                        const decoded = TransferEvent.decode(e.data, e.topics)
                        const transfer = manager.create(AssetMovement, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: r.txID,
                            blockID: block.id,
                            type: AssetType.Energy,
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
            await proc.touchAccount(r.gasPayer)
        }
        if (receipts.length) {
            await proc.touchAccount(block.beneficiary)
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
        if (snap && saveSnapshot) {
            await this.persist.insertSnapshot(snap, manager)
        }

        return proc.Movement.length + accs.length
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < 12) {
            return
        }

        const snapshots = await this.persist.listRecentSnapshot(head)

        if (snapshots.length) {
            for (; snapshots.length;) {
                if (snapshots[0].isTrunk === false) {
                    break
                }
                snapshots.shift()
            }
            if (snapshots.length) {
                await this.revertSnapshot(snapshots)
            }
        }

        head = await this.getHead()
        await this.persist.clearSnapShot(head)
    }

    protected async processGenesis() {
        const block = await getBlock(0)

        await getConnection().transaction(async (manager) => {
            const proc = new BlockProcessor(block, this.thor, manager)

            for (const addr of getPreAllocAccount(block.id)) {
                await proc.touchAccount(addr)
            }

            await proc.finalize()
            await this.persist.saveAccounts(proc.accounts(), manager)
            await this.persist.saveHead(0, manager)
        })
        this.head = 0
    }

    private async revertSnapshot(snapshots: Snapshot[]) {
        const headNum = blockIDtoNum(snapshots[0].blockID) - 1
        const toRevert = snapshots.map(x => x.blockID)
        await getConnection().transaction(async (manager) => {
            const accounts = new Map<string, Account>()

            for (; snapshots.length;) {
                const snap = snapshots.pop()
                for (const snapAcc of snap.data as SnapAccount[]) {
                    const acc = manager.create(Account, {
                        address: snapAcc.address,
                        balance: BigInt(snapAcc.balance),
                        energy: BigInt(snapAcc.energy),
                        blockTime: snapAcc.blockTime,
                        code: snapAcc.code,
                        master: snapAcc.master
                    })
                    accounts.set(snapAcc.address, acc)
                }
            }

            const toSave: Account[] = []
            for (const [_, acc] of accounts.entries()) {
                toSave.push(acc)
            }

            await this.persist.saveAccounts(toSave, manager)
            await this.persist.removeMovements(toRevert, manager)
            await this.persist.removeSnapshot(toRevert)
            await this.persist.saveHead(headNum, manager)
            console.log('-----revert to head:', headNum)
       })
        this.head = headNum
    }

}
