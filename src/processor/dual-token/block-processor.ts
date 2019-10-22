import { Block } from '../../db/entity/block'
import { Account } from '../../db/entity/account'
import { Thor } from '../../thor-rest'
import { VET } from '../../db/entity/vet'
import { Energy } from '../../db/entity/energy'
import { displayID } from '../../utils'

export class BlockProcessor {
    public VETMovement: VET[] = []
    public EnergyMovement: Energy[] = []
    private acc = new Map<string, Account>()
    private snap = new Map<string, object>()

    constructor(
        readonly block: Block,
        readonly getAccountFromDB: (addr: string) => Promise<Account>,
        readonly thor: Thor
    ) { }

    public async updateMaster(addr: string, master: string) {
        const acc = await this.getOrCreateAccount(addr)

        acc.master = master
        return acc
    }

    public async transferVeChain(transfer: VET) {
        const senderAcc = await this.getOrCreateAccount(transfer.sender)
        const recipientAcc = await this.getOrCreateAccount(transfer.recipient)

        // touch sender's balance
        let balance = BigInt(senderAcc.balance) - BigInt(transfer.amount)
        if (balance < 0) {
            throw new Error(`Fatal: VET balance under 0 of Account(${transfer.sender}) at Block(${displayID(this.block.id)})`)
        }
        senderAcc.balance = '0x' + balance.toString(16)

        // touch recipient's account
        balance = BigInt(recipientAcc.balance) + BigInt(transfer.amount)
        recipientAcc.balance = '0x' + balance.toString(16)

        this.VETMovement.push(transfer)
    }

    public async transferEnergy(transfer: Energy) {
        await this.touchAccount(transfer.sender)
        await this.touchAccount(transfer.recipient)

        this.EnergyMovement.push(transfer)
    }

    public async accounts() {
        const accs: Account[] = []
        for (const [_, acc] of this.acc.entries()) {
            const ret = await this.thor.getAccount(acc.address, this.block.id)
            acc.energy = ret.energy
            acc.blockTime = this.block.timestamp

            accs.push(acc)
        }
        return accs
    }

    public snapshots() {
        const ret: object[] = []
        for (const [_, acc] of this.snap.entries()) {
            ret.push(acc)
        }
        return ret
    }

    public touchAccount(addr: string) {
        return this.getOrCreateAccount(addr)
    }

    private async getOrCreateAccount(addr: string) {
        if (this.acc.has(addr)) {
            return this.acc.get(addr)
        }

        const acc = await this.getAccountFromDB(addr)
        if (acc) {
            this.acc.set(addr, acc)
            this.snap.set(addr, {...acc})
            return acc
        } else {
            console.log(`Create Account(${addr}) at block (${displayID(this.block.id)})`)
            const isGenesis = this.block.number === 0

            const revision = isGenesis ? this.block.id : this.block.parentID
            const ret = await this.thor.getAccount(addr, revision)

            if (this.block.number !== 0 && (ret.balance !== '0x0' || ret.energy !== '0x0')) {
                throw new Error(`Fatal: Account(${addr} got balances when creating at block (${this.block.id}))`)
            }

            const newAcc = new Account()

            newAcc.address = addr
            newAcc.master = null
            newAcc.balance = ret.balance
            newAcc.energy = ret.energy
            newAcc.blockTime = isGenesis ? this.block.timestamp : 0
            newAcc.code = null

            if (ret.hasCode) {
                const c = await this.thor.getCode(addr, revision)
                newAcc.code = c.code
            }

            this.acc.set(addr, newAcc)
            this.snap.set(addr, { ...newAcc })
            return newAcc

        }
    }

}
