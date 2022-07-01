import { SnapType, MoveType, CountType } from '../../explorer-db/types'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { displayID, blockIDtoNum } from '../../utils'
import { REVERSIBLE_WINDOW } from '../../config'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { TransferEvent, ZeroAddress, prototype } from '../../const'
import { insertSnapshot, clearSnapShot, removeSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { EntityManager, getConnection } from 'typeorm'
import { TokenBalance } from '../../explorer-db/entity/token-balance'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { abi } from 'thor-devkit'
import * as logger from '../../logger'
import { AggregatedMovement } from '../../explorer-db/entity/aggregated-move'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { Block } from '../../explorer-db/entity/block'
import { Counts } from '../../explorer-db/entity/counts'
import { saveCounts } from '../../service/counts'
import { AssetType, Token } from '../../types'
import { getExpandedBlockByNumber } from '../../service/block'

interface SnapAccount {
    address: string
    balance: string
    in: number
    out: number
    self: number
}

class BlockProcessor {
    private acc = new Map<string, TokenBalance>()
    private snap = new Map<string, SnapAccount>()
    private cnt = new Map<string, Counts>()

    constructor(
        readonly asset: AssetType,
        readonly persist: Persist,
        readonly block: Block,
        readonly manager: EntityManager
    ) { }

    async account(addr: string) {
        if (this.acc.has(addr)) {
            return { account: this.acc.get(addr)!, count: this.cnt.get(addr)! }
        }

        let acc = await this.persist.getAccount(addr, this.manager)
        if (!acc) {
            acc = this.manager.create(TokenBalance, {
                address: addr,
                type: this.asset,
                balance: BigInt(0)
            })
        }

        let cnt = await this.persist.getCount(addr, this.manager)
        if (!cnt) {
            cnt = this.manager.create(Counts, {
                address: addr,
                type: CountType.Transfer + this.asset,
                out: 0,
                in: 0,
                self: 0
            })
        }

        this.acc.set(acc.address, acc)
        this.cnt.set(acc.address, cnt)
        this.takeSnap(acc, cnt)
        return { account: acc, count: cnt }
    }

    takeSnap(acc: TokenBalance, cnt: Counts) {
        this.snap.set(acc.address, { address: acc.address, balance: acc.balance.toString(10), in: cnt.in, out: cnt.out, self: cnt.self })
    }

    counts() {
        // returns true if are the same
        const compareCNT = (cnt: Counts, snap: SnapAccount) => {
            if (cnt.in === snap.in && cnt.out === snap.out && cnt.self === snap.self) {
                return true
            }
            return false
        }

        for (const [addr, cnt] of this.cnt) {
            // remove unchanged counts
            if (compareCNT(cnt, this.snap.get(addr)!)) {
                this.cnt.delete(addr)
            }
        }

        return [...this.cnt.values()]
    }

    accounts() {
        // returns true if are the same
        const compareAccount = (acc: TokenBalance, snap: SnapAccount) => {
            if (acc.balance === BigInt(snap.balance)) {
                return true
            }
            return false
        }

        for (const [addr, acc] of this.acc) {
            // remove unchanged accounts
            if (compareAccount(acc, this.snap.get(addr)!)) {
                this.acc.delete(addr)
            }
        }

        return [...this.acc.values()]
    }

    snapshot() {
        const snapshot = new Snapshot()
        snapshot.blockID = this.block.id
        snapshot.type = SnapType.VIP180Token + this.asset
        snapshot.data = null

        if (this.snap.size) {
            snapshot.data = [...this.snap.values()]
        }
        return snapshot
    }
}

export class VIP180Transfer extends Processor {
    private persist: Persist
    private asset: AssetType

    constructor(
        readonly thor: Thor,
        readonly token: Token,
    ) {
        super()
        this.persist = new Persist(token)
        this.asset = AssetType[this.token.symbol as keyof typeof AssetType]
    }

    protected loadHead(manager?: EntityManager) {
        return this.persist.getHead(manager)
    }

    protected async saveHead(head: number, manager?: EntityManager) {
        await this.persist.saveHead(head, manager)
        return
    }

    protected async bornAt() {
        const events = await this.thor.filterEventLogs({
            range: { unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
            options: { offset: 0, limit: 1 },
            criteriaSet: [{ address: this.token.address, topic0: prototype.$Master.signature }],
            order: 'asc'
        })
        if (events.length) {
            return events[0].meta!.blockNumber
        } else {
            throw new Error('Fatal: no $Master event found')
        }
    }

    protected get snapType() {
        return SnapType.VIP180Token + this.asset
    }

    protected needFlush(count: number) {
        return count >= 2000
    }

    protected async nextBlock(from: number, to: number, manager: EntityManager) {
        const events = await this.thor.filterEventLogs({
            range: { unit: 'block', from: from, to: to },
            options: { offset: 0, limit: 1 },
            order: 'asc',
            criteriaSet: [{
                address: this.token.address, 
                topic0: TransferEvent.signature  
            }]
        })

        let blkNum: number
        if (events.length === 0) {
            blkNum = to
        } else {
            blkNum = events[0].meta!.blockNumber
        }

        return getExpandedBlockByNumber(blkNum)
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, saveSnapshot = false) {
        const proc = new BlockProcessor(this.asset, this.persist, block, manager)
        const movements: AssetMovement[] = []

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

        for (const meta of txs) {
            for (const [clauseIndex, o] of meta.transaction.outputs.entries()) {
                for (const [_, e] of o.events.entries()) {
                    if (e.address === this.token.address && e.topics[0] === TransferEvent.signature) {
                        let decoded: abi.Decoded
                        try {
                            decoded = TransferEvent.decode(e.data, e.topics)
                        } catch (e) {
                            continue
                        }
                        const movement = manager.create(AssetMovement, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: meta.txID,
                            blockID: block.id,
                            asset: this.asset,
                            moveIndex: {
                                txIndex: meta.seq.txIndex,
                                clauseIndex,
                                logIndex: e.overallIndex
                            }
                        })
                        attachAggregated(movement)
                        movements.push(movement)

                        logger.log(`Account(${movement.sender}) -> Account(${movement.recipient}): ${movement.amount} ${this.token.symbol}`)
                        // Transfer from address(0) considered to be mint token
                        const { account: senderAcc, count: senderCnt } = await proc.account(movement.sender)
                        if (movement.sender !== ZeroAddress) {
                            senderAcc.balance = senderAcc.balance - movement.amount
                            if (senderAcc.balance < 0) {
                                throw new Error(`Fatal: ${this.token.symbol} balance under 0 of Account(${movement.sender}) at Block(${displayID(block.id)})`)
                            }
                        }

                        const { account: recipientAcc, count: recipientCnt } = await proc.account(movement.recipient)
                        // burn on transferring to zero as default action
                        if (movement.recipient !== ZeroAddress) {
                            recipientAcc.balance = recipientAcc.balance + movement.amount
                        }

                        if (movement.sender === movement.recipient) {
                            senderCnt.self++
                        } else {
                            senderCnt.out++
                            recipientCnt.in++
                        }
                    }
                }
            }
        }

        if (movements.length) {
            await this.persist.saveMovements(movements, manager)
        }

        const accounts = proc.accounts()
        if (accounts.length) {
            await this.persist.saveAccounts(accounts, manager)
        }

        const counts = proc.counts()
        if (counts.length) {
            await saveCounts(counts, manager)
        }

        if (saveSnapshot) {
            await insertSnapshot(proc.snapshot(), manager)
        }

        return movements.length + accounts.length + counts.length
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
                const headID = snapshots[0].blockID
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {
                    const accounts = new Map<string, TokenBalance>()
                    const counts = new Map<string, Counts>()

                    for (; snapshots.length;) {
                        const snap = snapshots.pop()!
                        if (snap.data) {
                            for (const snapAcc of snap.data as SnapAccount[]) {
                                const acc = manager.create(TokenBalance, {
                                    address: snapAcc.address,
                                    balance: BigInt(snapAcc.balance),
                                    type: this.asset
                                })
                                const cnt = manager.create(Counts, {
                                    address: snapAcc.address,
                                    type: CountType.Transfer + this.asset,
                                    in: snapAcc.in,
                                    out: snapAcc.out,
                                    self: snapAcc.self
                                })
                                accounts.set(snapAcc.address, acc)
                                counts.set(snapAcc.address, cnt)
                            }
                        }
                    }

                    for (const [_, acc] of accounts.entries()) {
                        logger.log(`Account(${acc.address})'s Token(${this.token.symbol}) reverted to ${acc.balance} at Block(${displayID(headID)})`)
                    }

                    if (accounts.size) await this.persist.saveAccounts([...accounts.values()], manager)
                    if (counts.size) await saveCounts([...counts.values()], manager)
                    await this.persist.removeMovements(toRevert, manager)
                    await removeSnapshot(toRevert, this.snapType, manager)
                    await this.saveHead(headNum, manager)
                    logger.log('-> revert to head: ' + headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

    protected async processGenesis() {
        if (this.token.genesis) {
            const balances: TokenBalance[] = []
            await getConnection().transaction(async (manager) => {
                for (const addr in this.token.genesis) {
                    if (this.token.genesis[addr]) {
                        balances.push(manager.create(TokenBalance, {
                            address: addr,
                            balance: BigInt(this.token.genesis[addr]),
                            type: this.asset
                        }))
                    }
                }
                if (balances.length) {
                    await this.persist.saveAccounts(balances, manager)
                }
                await this.saveHead(this.birthNumber! - 1)
            })
            this.head = this.birthNumber! - 1
        }
    }

}
