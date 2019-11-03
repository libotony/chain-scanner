import { TokenBasic, TokenType, SnapType } from '../../types'
import { TransferLog } from '../../db/entity/movement'
import { displayID, blockIDtoNum } from '../../utils'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { $Master, TransferEvent, ZeroAddress } from '../../const'
import { getBlockReceipts } from '../../foundation/db'
import { EntityManager, getConnection } from 'typeorm'
import { TokenBalance } from '../../db/entity/token-balance'
import { Snapshot } from '../../db/entity/snapshot'
import { Processor } from '../processor'
import { abi } from 'thor-devkit'

interface SnapAccount {
    address: string
    type: TokenType
    balance: string
}

export class VIP180Transfer extends Processor {
    private persist: Persist

    constructor(readonly thor: Thor, readonly token: TokenBasic, readonly entityClass: new () => TransferLog) {
        super()
        this.persist = new Persist(token, entityClass)
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
            range: {unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
            options: {offset: 0, limit: 1},
            criteriaSet: [{address: this.token.address, topic0: $Master.signature}],
            order: 'asc'
        })
        if (events.length) {
            return events[0].meta.blockNumber
        } else {
            throw new Error('Fatal: no $Master event found')
        }
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const { block, receipts } = await getBlockReceipts(blockNum, manager)

        const movements: TransferLog[] = []
        const acc = new Map<string, TokenBalance>()
        const snap = new Map<string, SnapAccount>()

        const account = async (addr: string) => {
            if (acc.has(addr)) {
                return acc.get(addr)
            }
            const dbAcc = await this.persist.getAccount(addr, manager)

            if (dbAcc) {
                acc.set(addr, dbAcc)
                snap.set(addr, {...dbAcc, balance: dbAcc.balance.toString(10)})
                return dbAcc
            } else {
                const newAcc = manager.create(TokenBalance, {
                    address: addr,
                    type: TokenType[this.token.symbol],
                    balance: BigInt(0)
                })
                acc.set(addr, newAcc)
                snap.set(addr, {...newAcc, balance: newAcc.balance.toString(10)})
                return newAcc
            }

        }

        for (const r of receipts) {
            for (const [clauseIndex, o] of r.outputs.entries()) {
                for (const [logIndex, e] of o.events.entries()) {
                    if (e.address === this.token.address && e.topics[0] === TransferEvent.signature) {
                        let decoded: abi.Decoded
                        try {
                            decoded = TransferEvent.decode(e.data, e.topics)
                        } catch (e) {
                            continue
                        }
                        const movement = manager.create(this.entityClass, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: r.txID,
                            blockID: block.id,
                            clauseIndex,
                            logIndex
                        })
                        movements.push(movement)

                        console.log(`Account(${movement.sender}) -> Account(${movement.recipient}): ${movement.amount} ${this.token.symbol}`)
                        if (block.number !== await this.bornAt() && movement.sender !== ZeroAddress) {
                            const senderAcc = await account(movement.sender)
                            senderAcc.balance = senderAcc.balance - movement.amount
                            if (senderAcc.balance < 0) {
                                throw new Error(`Fatal: OCE balance under 0 of Account(${movement.sender}) at Block(${displayID(block.id)})`)
                            }
                        }
                        const recipientAcc = await account(movement.recipient)
                        recipientAcc.balance = recipientAcc.balance + movement.amount
                    }
                }
            }
        }

        if (movements.length) {
            await this.persist.insertMovements(movements, manager)
        }

        if (acc.size) {
            const x: TokenBalance[] = []
            for (const [_, a] of acc.entries()) {
                x.push(a)
            }
            await this.persist.saveAccounts(x, manager)
        }

        if (snap.size && saveSnapshot) {
            const x: object[] = []
            for (const [_
                , s] of snap.entries()) {
                x.push(s)
            }

            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = SnapType.VIP180Token + TokenType[this.token.symbol]
            snapshot.data = x
            this.persist.saveSnapshot(snapshot, manager)
        }

        return movements.length + acc.size
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
                const headNum = blockIDtoNum(snapshots[0].blockID) - 1
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {
                    const accounts = new Map<string, TokenBalance>()

                    for (; snapshots.length;) {
                        const snap = snapshots.pop()
                        for (const snapAcc of snap.data as SnapAccount[]) {
                            const acc = manager.create(TokenBalance, {
                                address: snapAcc.address,
                                balance: BigInt(snapAcc.balance),
                                type: snapAcc.type,
                            })
                            accounts.set(snapAcc.address, acc)
                        }
                    }

                    const toSave: TokenBalance[] = []
                    for (const [_, acc] of accounts.entries()) {
                        toSave.push(acc)
                    }

                    await this.persist.saveAccounts(toSave, manager)
                    await this.persist.removeMovements(toRevert, manager)
                    await this.persist.removeSnapshot(toRevert)
                    await this.persist.saveHead(headNum, manager)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await this.persist.clearSnapShot(head)
    }

}
