import { TokenBasic, TokenType, SnapType } from '../../types'
import { TransferLog } from '../../db/entity/movement'
import { sleep, REVERSIBLE_WINDOW, displayID } from '../../utils'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { $Master, TransferEvent, ZeroAddress } from '../../const'
import { getBlockReceipts, getBest, getBlock } from '../../foundation/db'
import { EntityManager, getConnection } from 'typeorm'
import { TokenBalance } from '../../db/entity/token-balance'
import { Snapshot } from '../../db/entity/snapshot'

interface SnapAccount {
    address: string
    type: TokenType
    balance: string
}

export class VIP180Transfer {

    private head: number | null = null
    private birthNumber: number|null = null
    private persist: Persist

    constructor(readonly thor: Thor, readonly token: TokenBasic, readonly entityClass: new () => TransferLog) {
        this.persist = new Persist(token, entityClass)
     }

    public async start() {
        for (; ;) {
            try {
                await sleep(5 * 1000)

                // await this.latestTrunkCheck()

                let head = await this.getHead()
                if (head === this.birthNumber) {
                    await this.processGenesis()
                }

                // const best = await getBest()
                const best = await getBlock(4000000)

                if (best.number <= head) {
                    break
                }

                if (best.number - head > REVERSIBLE_WINDOW) {
                    await this.fastForward(best.number - REVERSIBLE_WINDOW)
                    head = await this.getHead()
                }

                await getConnection().transaction(async (manager) => {
                    for (let i = head + 1; i <= best.number; i++) {
                        await this.processBlock(i, manager, true)
                    }
                    await this.persist.saveHead(best.number, manager)
                })
                this.head = best.number
            } catch (e) {
                console.log(`token ${this.token.symbol} loop:`, e)
            }
        }
    }

    public async bornAt() {
        if (this.birthNumber) {
            return this.birthNumber
        }
        const events = await this.thor.filterEventLogs({
            range: {unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
            options: {offset: 0, limit: 1},
            criteriaSet: [{address: this.token.address, topic0: $Master.signature}],
            order: 'asc'
        })
        if (events.length) {
            this.birthNumber = events[0].meta.blockNumber
            return this.birthNumber
        } else {
            throw new Error('Fatal: no $Master event found')
        }
    }

    private async getHead() {
        if (this.head !== null) {
            return this.head
        } else {
            const head = await this.persist.getHead()

            const freshStartPoint =  await this.bornAt() - 1
            if (!head) {
                return freshStartPoint
            } else {
                return head
            }
        }
    }

    private async processGenesis() {
        return
    }

    /**
     * @return inserted column number
     */
    private async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
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
                        const decoded = TransferEvent.decode(e.data, e.topics)
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

                        if (movement.sender !== ZeroAddress) {
                            const senderAcc = await account(movement.sender)
                            senderAcc.balance = senderAcc.balance - movement.amount
                            if (senderAcc.balance < 0) {
                                throw new Error(`Fatal: VET balance under 0 of Account(${movement.sender}) at Block(${displayID(block.id)})`)
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

    private async fastForward(target: number) {
        const head = await this.getHead()

        let count = 0

        for (let i = head + 1; i <= target;) {
            const startNum = i
            console.time('time')
            await getConnection().transaction(async (manager) => {
                for (; i <= target;) {
                    count += await this.processBlock(i++, manager)

                    if (count >= 5000) {
                        await this.persist.saveHead(i - 1, manager)
                        process.stdout.write(`imported blocks(${i - startNum}) at block(${i - 1}) `)
                        console.timeEnd('time')
                        count = 0
                        break
                    }

                    if (i === target + 1) {
                        await this.persist.saveHead(i - 1, manager)
                        process.stdout.write(`processed blocks(${i - startNum}) at block(${i - 1}) `)
                        console.timeEnd('time')
                        break
                    }

                }
            })
            this.head = i - 1
        }
    }

}
