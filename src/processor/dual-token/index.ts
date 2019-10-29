import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { sleep, blockIDtoNum, displayID, REVERSIBLE_WINDOW } from '../../utils'
import { $Master, EnergyAddress, TransferEvent, getPreAllocAccount } from '../../const'
import { getConnection, EntityManager } from 'typeorm'
import { BlockProcessor, SnapAccount } from './block-processor'
import { Transfer } from '../../db/entity/transfer'
import { Energy } from '../../db/entity/energy'
import { Account } from '../../db/entity/account'
import { Snapshot } from '../../db/entity/snapshot'

export class DualToken {
    private head: number | null = null
    private persist: Persist

    constructor(readonly thor: Thor) {
        this.persist = new Persist()
    }

    public async start() {
        for (; ;) {
            try {
                await sleep(5 * 1000)

                await this.latestTrunkCheck()

                const head = await this.getHead()
                if (head === -1) {
                    await this.processGenesis()
                }

                const best = await this.persist.getBest()
                // const best = await this.persist.getBlock(700000)

                if (best.timestamp < (new Date().getTime() / 1000 - REVERSIBLE_WINDOW * 10)) {
                    await this.fastForward(best.number)
                } else {
                    await getConnection().transaction(async (manager) => {
                        for (let i = head + 1; i <= best.number; i++) {
                            await this.processBlock(i++, manager, true)
                        }
                        await this.persist.saveHead(best.number, manager)
                    })
                    this.head = best.number
                }
            } catch (e) {
                console.log('dual-token loop:', e)
            }
        }

    }

    private async getHead() {
        if (this.head !== null) {
            return this.head
        } else {
            const head = await this.persist.getHead()

            const freshStartPoint =  -1
            if (!head) {
                return freshStartPoint
            } else {
                return head
            }

        }
    }

    private async latestTrunkCheck() {
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

    /**
     * @return inserted column number
     */
    private async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const { block, receipts } = await this.persist.getBlockReceipts(blockNum)

        const proc = new BlockProcessor(block, this.thor, manager)
        for (const r of receipts) {
            for (const [clauseIndex, o] of r.outputs.entries()) {
                for (const [logIndex, t] of o.transfers.entries()) {

                    const transfer = manager.create(Transfer, {
                        ...t,
                        amount: BigInt(t.amount),
                        txID: r.txID,
                        blockID: block.id,
                        clauseIndex,
                        logIndex
                    })

                    await proc.transferVeChain(transfer)
                }
                for (const [logIndex, e] of o.events.entries()) {
                    if (e.topics[0] === $Master.signature) {
                        const decoded = $Master.decode(e.data, e.topics)
                        await proc.master(e.address, decoded.newMaster)
                    } else if (e.address === EnergyAddress && e.topics[0] === TransferEvent.signature) {
                        const decoded = TransferEvent.decode(e.data, e.topics)
                        const transfer = manager.create(Energy, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: BigInt(decoded._value),
                            txID: r.txID,
                            blockID: block.id,
                            clauseIndex,
                            logIndex
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

        if (proc.VETMovement.length) {
            await this.persist.insertVETMovements(proc.VETMovement, manager)
        }
        if (proc.EnergyMovement.length) {
            await this.persist.insertEnergyMovements(proc.EnergyMovement, manager)
        }

        const accs = proc.accounts()
        if (accs.length) {
            await this.persist.saveAccounts(accs, manager)
        }

        const snap = proc.snapshot()
        if (snap && saveSnapshot) {
            await this.persist.saveSnapshot(snap)
        }

        return proc.VETMovement.length + proc.EnergyMovement.length + accs.length
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
       })
        this.head = headNum
    }

    private async processGenesis() {
        const { block } = await this.persist.getBlockReceipts(0)

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
