import { Block } from '../../db/entity/block'
import { Account } from '../../db/entity/account'
import { Thor } from '../../thor-rest'
import { Transfer } from '../../db/entity/transfer'
import { Energy } from '../../db/entity/energy'
import { displayID } from '../../utils'
import { EntityManager } from 'typeorm'

export class BlockProcessor {
    public VETMovement: Transfer[] = []
    public EnergyMovement: Energy[] = []

    private acc = new Map<string, Account>()
    private snap = new Map<string, object>()
    private code = new Set<string>()
    private balance = new Set<string>()

    constructor(
        readonly block: Block,
        readonly thor: Thor,
        readonly manager: EntityManager
    ) { }

    public async master(addr: string, master: string) {
        const acc = await this.account(addr)

        acc.master = master
        this.code.add(addr)
        return acc
    }

    public async transferVeChain(move: Transfer) {
        const senderAcc = await this.account(move.sender)
        const recipientAcc = await this.account(move.recipient)

        // touch sender's balance
        let balance = BigInt(senderAcc.balance) - BigInt(move.amount)
        if (balance < 0) {
            throw new Error(`Fatal: VET balance under 0 of Account(${move.sender}) at Block(${displayID(this.block.id)})`)
        }
        senderAcc.balance = balance

        // touch recipient's account
        balance = BigInt(recipientAcc.balance) + BigInt(move.amount)
        recipientAcc.balance = balance

        this.VETMovement.push(move)
    }

    public async transferEnergy(move: Energy) {
        // await this.touchAccount(transfer.sender)
        // await this.touchAccount(transfer.recipient)

        this.EnergyMovement.push(transfer)
    }

    public accounts() {
        const accs: Account[] = []
        for (const [_, acc] of this.acc.entries()) {
            accs.push(acc)
        }
        return accs
    }

    public async finalize() {
        for (const [_, acc] of this.acc.entries()) {
            const ret = await this.thor.getAccount(acc.address, this.block.id)
            acc.energy = BigInt(ret.energy)
            acc.blockTime = this.block.timestamp

            if (this.balance.has(acc.address)) {
                acc.balance = BigInt(ret.balance)
            }

            if (this.code.has(acc.address) && ret.hasCode) {
                const code = await this.thor.getCode(acc.address, this.block.id)
                if (code && code.code !== '0x') {
                    acc.code = code.code
                }
             }

        }
    }

    public snapshots() {
        const ret: object[] = []
        for (const [_, acc] of this.snap.entries()) {
            ret.push(acc)
        }
        return ret
    }

    public async touchAccount(addr: string) {
        await this.account(addr)
        return
    }

    private async account(addr: string) {
        if (this.acc.has(addr)) {
            return this.acc.get(addr)
        }

        const acc = await this.manager.getRepository(Account).findOne({ address: addr })
        if (acc) {
            this.acc.set(addr, acc)
            this.snap.set(addr, {...acc})
            return acc
        } else {
            console.log(`Create Account(${addr}) at block (${displayID(this.block.id)})`)
            const newAcc = this.manager.create(Account, {
                address: addr,
                balance: BigInt(0),
                energy: BigInt(0),
                code: null,
                master: null
            })

            if (this.block.number === 0) {
                this.balance.add(addr)
            }
            this.code.add(addr)
            this.acc.set(addr, newAcc)
            this.snap.set(addr, { ...newAcc })
            return newAcc
        }
    }

}
