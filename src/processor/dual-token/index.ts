import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { sleep, displayID } from '../../utils'
import { $Master, EnergyAddress, Transfer, genesisAccounts } from './const'
import { getConnection, EntityManager } from 'typeorm'
import { BlockProcessor } from './block-processor'
import { VET } from '../../db/entity/vet'
import { Energy } from '../../db/entity/energy'

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
                // await this.latestTrunkCheck()
                const head = await this.getHead()
                if (head === -1) {
                    await this.processGenesis()
                }

                // const best = await this.persist.getBest()
                await this.fastForward(50000)
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

            // TODO: for test&dev starting from 3,500,000
            // const freshStartPoint = -1
            const freshStartPoint =  -1
            if (!head) {
                return freshStartPoint
            } else {
                return head
            }

        }
    }

    private async latestTrunkCheck() {
        const head = await this.getHead()

        if (head < 12) {
            return
        }

        // if (head === '') {
        //     return
        // }

        // const headNum = blockIDtoNum(head)

    }

    /**
     * @return inserted column number
     */
    private async processBlock(blockNum: number, manager: EntityManager) {
        const { block, receipts } = await this.persist.getBlockReceipts(blockNum)

        const proc = new BlockProcessor(block, (addr: string) => this.persist.getAccount(addr, manager), this.thor)

        for (const r of receipts) {
            for (const [clauseIndex, o] of r.outputs.entries()) {
                for (const [logIndex, t] of o.transfers.entries()) {

                    const transfer = manager.create(VET, {
                        ...t,
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
                        await proc.updateMaster(e.address, decoded.newMaster)
                    } else if (e.address === EnergyAddress && e.topics[0] === Transfer.signature) {
                        const decoded = Transfer.decode(e.data, e.topics)
                        const transfer = manager.create(Energy, {
                            sender: decoded._from,
                            recipient: decoded._to,
                            amount: '0x' + BigInt(decoded._value).toString(16),
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
        await proc.touchAccount(block.beneficiary)

        if (proc.VETMovement.length) {
            this.persist.insertVETMovements(proc.VETMovement, manager)
        }
        if (proc.EnergyMovement.length) {
            this.persist.insertEnergyMovements(proc.EnergyMovement, manager)
        }
        const accs = await proc.accounts()
        if (accs.length) {
            this.persist.saveAccounts(accs, manager)
        }

        return proc.VETMovement.length + proc.EnergyMovement.length + accs.length
    }

    private async processGenesis() {
        const { block } = await this.persist.getBlockReceipts(0)

        const proc = new BlockProcessor(block, this.persist.getAccount, this.thor)
        for (const addr of genesisAccounts) {
            await proc.touchAccount(addr)
        }

        await getConnection().transaction(async (manager) => {
            await this.persist.saveAccounts(await proc.accounts(), manager)
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
