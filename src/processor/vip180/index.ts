import { SnapType, AssetType } from '../../explorer-db/types'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { displayID, blockIDtoNum } from '../../utils'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { $Master, TransferEvent, ZeroAddress } from '../../const'
import { insertSnapshot, clearSnapShot, removeSnapshot, listRecentSnapshot } from '../snapshot'
import { EntityManager, getConnection } from 'typeorm'
import { TokenBalance } from '../../explorer-db/entity/token-balance'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { abi } from 'thor-devkit'
import { TokenConfig, TokenBasic } from '../../const/tokens'
import { getBlockByNumber, getBlockReceipts } from '../../explorer-db/service/block'

interface SnapAccount {
    address: string
    type: AssetType
    balance: string
}

export class VIP180Transfer extends Processor {
    private persist: Persist

    constructor(
        readonly thor: Thor,
        readonly token: TokenBasic & TokenConfig,
    ) {
        super()
        this.persist = new Persist(token)
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
        const block = await getBlockByNumber(blockNum, manager)
        const receipts = await getBlockReceipts(block.id, manager)

        const movements: AssetMovement[] = []
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
                    type: AssetType[this.token.symbol],
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
                        const movement = manager.create(AssetMovement, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: r.txID,
                            blockID: block.id,
                            type: AssetType[this.token.symbol],
                            moveIndex: {
                                txIndex: r.txIndex,
                                clauseIndex,
                                logIndex
                            }
                        })
                        movements.push(movement)

                        console.log(`Account(${movement.sender}) -> Account(${movement.recipient}): ${movement.amount} ${this.token.symbol}`)
                        // Transfer from address(0) considered to be mint token
                        if (movement.sender !== ZeroAddress) {
                            const senderAcc = await account(movement.sender)
                            senderAcc.balance = senderAcc.balance - movement.amount
                            if (senderAcc.balance < 0) {
                                throw new Error(`Fatal: ${this.token.symbol} balance under 0 of Account(${movement.sender}) at Block(${displayID(block.id)})`)
                            }
                        }

                        if (this.token.burnOnZero !== true || movement.recipient !== ZeroAddress) {
                            const recipientAcc = await account(movement.recipient)
                            recipientAcc.balance = recipientAcc.balance + movement.amount
                        }
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
            for (const [_, s] of snap.entries()) {
                x.push(s)
            }

            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = SnapType.VIP180Token + AssetType[this.token.symbol]
            snapshot.data = x
            insertSnapshot(snapshot, manager)
        }

        return movements.length + acc.size
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < 12) {
            return
        }

        const snapshots = await listRecentSnapshot(head, SnapType.VIP180Token + AssetType[this.token.symbol])

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
                    await removeSnapshot(toRevert, SnapType.VIP180Token + AssetType[this.token.symbol], manager)
                    await this.persist.saveHead(headNum, manager)
                    console.log('-> revert to head:', headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, SnapType.VIP180Token + AssetType[this.token.symbol])
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
                            type: AssetType[this.token.symbol]
                        }))
                    }
                }
                if (balances.length) {
                    await this.persist.saveAccounts(balances, manager)
                }
                await this.saveHead(this.birthNumber - 1)
            })
            this.head = this.birthNumber - 1
        }
    }

}
