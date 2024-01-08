import { Thor } from '../../thor-rest'
import { Persist, TypeEnergyCount, TypeVETCount } from './persist'
import { blockIDtoNum, displayID } from '../../utils'
import { REVERSIBLE_WINDOW, SUICIDED_CHECK_INTERVAL } from '../../config'
import { EnergyAddress, TransferEvent, getPreAllocAccount, Network, prototype, getForkConfig, ForkConfig } from '../../const'
import { getConnection, EntityManager } from 'typeorm'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { Account } from '../../explorer-db/entity/account'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { clearSnapShot, removeSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { Processor } from '../processor'
import { SnapType, MoveType } from '../../explorer-db/types'
import * as logger from '../../logger'
import { AggregatedMovement } from '../../explorer-db/entity/aggregated-move'
import { Block } from '../../explorer-db/entity/block'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { getBlockByNumber, getExpandedBlockByID, getExpandedBlockByNumber, getNextBlockIDWithTx } from '../../service/block'
import { Counts } from '../../explorer-db/entity/counts'
import { saveCounts } from '../../service/counts'
import { AssetType } from '../../tokens'
import { BlockProcessorV2, SnapAccount } from './block-processor-v2'

export class DualToken extends Processor {
    private persist: Persist
    private forkConfig: ForkConfig

    constructor(readonly thor: Thor) {
        super()
        this.persist = new Persist()
        this.forkConfig = getForkConfig(thor.genesisID)
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

    protected needFlush(count: number) {
        return count >= 2000
    }

    // dual token cannot skip the blocks which update builtin or precompiled contracts
    // For now: VIP191 and ETH_IST
    protected async nextBlock(from:number, to:number, manager:EntityManager) {
        let blockID = await getNextBlockIDWithTx(from, to, manager)
        const b = blockID ? await getExpandedBlockByID(blockID) : await getExpandedBlockByNumber(to)
        
        const block = b.block!
        if (block.number === from) {
            return b
        }

        // do not skip some of the hard fork blocks
        // which updates builtin or precompiled contracts
        if (from < this.forkConfig.VIP191 && this.forkConfig.VIP191 < block.number) {
            return getExpandedBlockByNumber(this.forkConfig.VIP191)
        }
        if (from < this.forkConfig.ETH_IST && this.forkConfig.ETH_IST < block.number) {
            return getExpandedBlockByNumber(this.forkConfig.ETH_IST)
        }

        return b
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, keepSnapshot = false) {
        const proc = new BlockProcessorV2(block, this.thor, manager)
        await proc.prepare()

        const attachAggregated = (transfer: AssetMovement) => {
            if (transfer.sender === transfer.recipient) {
                const move = manager.create(AggregatedMovement, {
                    participant: transfer.sender,
                    type: MoveType.Self,
                    asset: transfer.asset,
                    seq: {
                        blockNumber: block.number,
                        moveIndex: transfer.moveIndex
                    }
                })

                transfer.aggregated = [move]
            } else {
                const sender = manager.create(AggregatedMovement, {
                    participant: transfer.sender,
                    type: MoveType.Out,
                    asset: transfer.asset,
                    seq: {
                        blockNumber: block.number,
                        moveIndex: transfer.moveIndex
                    }
                })

                const recipient = manager.create(AggregatedMovement, {
                    participant: transfer.recipient,
                    type: MoveType.In,
                    asset: transfer.asset,
                    seq: {
                        blockNumber: block.number,
                        moveIndex: transfer.moveIndex
                    }
                })

                transfer.aggregated = [sender, recipient]
            }
        }

        let reward = BigInt(0)
        for (const meta of txs) {
            for (const [clauseIndex, o] of meta.transaction.outputs.entries()) {
                for (const [_, t] of o.transfers.entries()) {
                    const transfer = manager.create(AssetMovement, {
                        ...t,
                        amount: BigInt(t.amount),
                        txID: meta.txID,
                        blockID: block.id,
                        asset: AssetType.VET,
                        moveIndex: {
                            txIndex: meta.seq.txIndex,
                            clauseIndex,
                            logIndex: t.overallIndex
                        }
                    })
                    attachAggregated(transfer)

                    await proc.transferVET(transfer)
                    if (keepSnapshot) {
                        logger.log(`Account(${transfer.sender}) -> Account(${transfer.recipient}): ${transfer.amount} VET`)
                    }
                }
                for (const [_, e] of o.events.entries()) {
                    if (e.topics[0] === prototype.$Master.signature) {
                        const decoded = prototype.$Master.decode(e.data, e.topics)
                        await proc.master(e.address, decoded.newMaster, meta.transaction.origin)
                    } else if (e.topics[0] === prototype.$Sponsor.signature) {
                        const decoded = prototype.$Sponsor.decode(e.data, e.topics)
                        switch (decoded.action) {
                            case prototype.selected:
                                await proc.sponsorSelected(e.address, decoded.sponsor)
                                break
                            case prototype.unsponsored:
                                await proc.unsponsored(e.address, decoded.sponsor)
                                break
                            case prototype.sponsored:
                                await proc.sponsored(e.address, decoded.sponsor)
                                break
                        }
                    } else if (e.address === EnergyAddress && e.topics[0] === TransferEvent.signature) {
                        const decoded = TransferEvent.decode(e.data, e.topics)
                        const transfer = manager.create(AssetMovement, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: meta.txID,
                            blockID: block.id,
                            asset: AssetType.VTHO,
                            moveIndex: {
                                txIndex: meta.seq.txIndex,
                                clauseIndex,
                                logIndex: e.overallIndex
                            }
                        })
                        attachAggregated(transfer)

                        await proc.transferEnergy(transfer)
                        if (keepSnapshot) {
                            logger.log(`Account(${transfer.sender}) -> Account(${transfer.recipient}): ${transfer.amount} VTHO`)
                        }
                    }
                }
            }
            await proc.txFee(meta.transaction.gasPayer, meta.transaction.paid)
            reward += BigInt(meta.transaction.reward)
        }
        if (reward > BigInt(0)) {
            await proc.reward(block.beneficiary, reward)
        }

        if (keepSnapshot && (block.number % SUICIDED_CHECK_INTERVAL === 0)) {
            await proc.checkDestruct()
        }
        return await proc.finalize(this.persist, manager, keepSnapshot) 
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
                await this.revertSnapshot(snapshots)
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

    protected async processGenesis() {
        const block = (await getBlockByNumber(0))!

        await getConnection().transaction(async (manager) => {
            const proc = new BlockProcessorV2(block, this.thor, manager)
            await proc.prepare()

            const accounts = getPreAllocAccount(block.id as Network)
            await proc.handlePreAlloc(accounts)

            await proc.finalize(this.persist, manager, false)
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
            const vCNTs = new Map<string, Counts>()
            const eCNTs = new Map<string, Counts>()
            const accCreated: string[] = []

            for (; snapshots.length;) {
                const snap = snapshots.pop()!
                if (snap.data) {
                    for (const snapAcc of snap.data as SnapAccount[]) {
                        if (snapAcc.firstSeen === snap.block.timestamp) {
                            accCreated.push(snapAcc.address)
                        } else {
                            const acc = manager.create(Account, {
                                address: snapAcc.address,
                                balance: BigInt(snapAcc.balance),
                                energy: BigInt(snapAcc.energy),
                                generated: BigInt(snapAcc.generated),
                                paid: BigInt(snapAcc.paid),
                                blockTime: snapAcc.blockTime,
                                firstSeen: snapAcc.firstSeen,
                                code: snapAcc.code,
                                master: snapAcc.master,
                                sponsor: snapAcc.sponsor,
                                suicided: snapAcc.suicided
                            })
                            accounts.set(snapAcc.address, acc)

                            vCNTs.set(snapAcc.address, manager.create(Counts, {
                                address: snapAcc.address,
                                type: TypeVETCount,
                                in: snapAcc.vetCount.in,
                                out: snapAcc.vetCount.out,
                                self: snapAcc.vetCount.self
                            }))
                            eCNTs.set(snapAcc.address, manager.create(Counts, {
                                address: snapAcc.address,
                                type: TypeEnergyCount,
                                in: snapAcc.energyCount.in,
                                out: snapAcc.energyCount.out,
                                self: snapAcc.energyCount.self
                            }))
                        }
                    }
                }
            }

            for (const [_, acc] of accounts.entries()) {
                logger.log(`Account(${acc.address}) reverted to VET(${acc.balance}) Energy(${acc.balance}) Generated(${acc.generated}) Paid(${acc.paid}) BlockTime(${acc.blockTime}) at Block(${displayID(headID)})`)
            }
            for (const acc of accCreated) {
                logger.log(`newAccount(${acc}) removed for revert at Block(${displayID(headID)})`)
            }

            if (accCreated.length) {
                await this.persist.removeAccounts(accCreated, manager)
                await this.persist.removeCounts(accCreated, manager)
            }
            if (accounts.size) await this.persist.saveAccounts([...accounts.values()], manager)
            if (vCNTs.size || eCNTs.size) await saveCounts([...vCNTs.values(), ...eCNTs.values()], manager)
            await this.persist.removeMovements(toRevert, manager)
            await removeSnapshot(toRevert, this.snapType, manager)
            await this.saveHead(headNum, manager)
            logger.log('-> revert to head: ' + headNum)
        })
        this.head = headNum
    }

}
