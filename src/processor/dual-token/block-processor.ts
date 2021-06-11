import { Block } from '../../explorer-db/entity/block'
import { Account } from '../../explorer-db/entity/account'
import { Thor } from '../../thor-rest'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { displayID } from '../../utils'
import { EntityManager, Not, IsNull } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { SnapType } from '../../explorer-db/types'
import { ExtensionAddress, getForkConfig, PrototypeAddress, prototype, ZeroAddress, IstPreCompiledContract } from '../../const'
import * as logger from '../../logger'

export interface SnapAccount {
    address: string
    balance: string
    energy: string
    blockTime: number
    firstSeen: number
    code: string | null
    master: string | null
    sponsor: string | null
    suicided: boolean
}

export class BlockProcessor {
    public Movement: AssetMovement[] = []

    private acc = new Map<string, Account>()
    private snap = new Map<string, SnapAccount>()
    private updateCode = new Set<string>()
    private updateEnergy = new Set<string>()
    private suicided = new Set<string>()
    private updateMaster = new Map<string, { master: string; caller: string }>()

    constructor(
        readonly block: Block,
        readonly thor: Thor,
        readonly manager: EntityManager
    ) { }

    public async prepare() {
        const forkConfig = getForkConfig(this.thor.genesisID)
        if (this.block.number === forkConfig.VIP191) {
            await this.account(ExtensionAddress)
            this.updateCode.add(ExtensionAddress)
        }
        if (this.block.number === forkConfig.ETH_IST) {
            for (let addr of IstPreCompiledContract) {
                await this.account(addr)
                this.updateCode.add(addr)
            }
        }
    }

    public async destruct(addr: string) {
        await this.account(addr)

        this.suicided.add(addr)
    }

    public async master(addr: string, master: string, caller: string) {
        await this.account(addr)

        this.updateMaster.set(addr, { master, caller })
        this.updateCode.add(addr)
    }

    public async sponsorSelected(addr: string, sponsor: string) {
        const acc = await this.account(addr)

        logger.log(`Account(${addr}) selected Sponsor(${sponsor})`)
        acc.sponsor = sponsor
    }

    public async sponsorUnSponsored(addr: string, sponsor: string) {
        const acc = await this.account(addr)

        if (acc.sponsor === sponsor) {
            acc.sponsor = null
            logger.log(`Account(${addr}) got UnSponsor by ${sponsor}`)
        }
    }

    public async transferVeChain(move: AssetMovement) {
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

        this.Movement.push(move)

        await this.touchEnergy(move.sender)
        await this.touchEnergy(move.recipient)
    }

    public async transferEnergy(move: AssetMovement) {
        this.Movement.push(move)

        if (move.amount !== BigInt(0)) {
            await this.account(move.sender)
            await this.account(move.recipient)
        
            await this.touchEnergy(move.sender)
            await this.touchEnergy(move.recipient)   
        }
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
            if (this.updateEnergy.has(acc.address)) {
                const ret = await this.thor.getAccount(acc.address, this.block.id)
                acc.energy = BigInt(ret.energy)
                acc.blockTime = this.block.timestamp

                if (
                    acc.code !== null && ret.hasCode === false &&
                    acc.energy === BigInt(0) && acc.balance === BigInt(0)
                ) {
                    const master = await this.getMaster(acc.address)
                    // contract suicide
                    if (master === null) {
                        acc.code = null
                        acc.master = null
                        acc.sponsor = null
                        acc.deployer = null
                        acc.suicided = true
                    }
                }
            }

            if (this.updateCode.has(acc.address)) {
                const code = await this.thor.getCode(acc.address, this.block.id)
                if (code && code.code !== '0x') {
                    // updateCode was triggered by updateMaster and other customized action
                    if (this.updateMaster.has(acc.address) && acc.master === null && acc.code === null && acc.deployer === null) {
                        // this is contract deployment
                        acc.deployer = this.updateMaster.get(acc.address)!.caller
                    }
                    acc.code = code.code
                }
            }

            if (this.updateMaster.has(acc.address)) {
                acc.master= this.updateMaster.get(acc.address)!.master
            }

            if (this.suicided.has(acc.address)) {
                acc.code = null
                acc.master = null
                acc.sponsor = null
                acc.deployer = null
                acc.suicided = true
            }
        }
    }

    public snapshot(): Snapshot {
        const snap = new Snapshot()
        snap.blockID = this.block.id
        snap.type = SnapType.DualToken

        if (!this.snap.size) {
            snap.data = null
        } else {
            const data: object[] = []
            for (const [_, acc] of this.snap.entries()) {
                data.push(acc)
            }
            snap.data = data
        }

        return snap
    }

    public async touchEnergy(addr: string) {
        await this.account(addr)
        if (this.updateEnergy.has(addr)) {
            return
        }
        this.thor.getAccount(addr, this.block.id).catch()
        this.updateEnergy.add(addr)
        return
    }

    public async genesisAccount(addr: string) {
        if (this.block.number !== 0) {
            throw new Error('calling genesisAccount is forbid in block #' + this.block.number)
        }
        const acc = await this.account(addr)
        const chainAcc = await this.thor.getAccount(acc.address, this.block.id)

        acc.balance = BigInt(chainAcc.balance)
        acc.energy = BigInt(chainAcc.energy)
        acc.blockTime = this.block.timestamp

        if (chainAcc.hasCode) {
            const chainCode = await this.thor.getCode(acc.address, this.block.id)
            acc.code = chainCode.code
        }
    }

    public async destructCheck() {
        const accounts = await this.manager
            .getRepository(Account)
            .find({
                code: Not(IsNull()) // might transfer vet or energy after it's destructed
            })
        for (const acc of accounts) {
            const chainAcc = await this.thor.getAccount(acc.address, this.block.id)
            if (chainAcc.hasCode === false) {
                const master = await this.getMaster(acc.address)
                if (master === null) {
                    // contract suicided
                    await this.destruct(acc.address)
                }
            }
        }
    }

    public async getCurrentSponsor(addr: string) {
        const ret = await this.thor.explain({
            clauses: [{
                to: PrototypeAddress,
                value: '0x0',
                data: prototype.currentSponsor.encode(addr)
            }]
        }, this.block.id)

        const decoded = prototype.currentSponsor.decode(ret[0].data)
        if (decoded['0'] === ZeroAddress) {
            return null
        } else {
            return decoded['0'] as string
        }
    }

    private takeSnap(acc: Account) {
        this.snap.set(acc.address, {
            address: acc.address,
            balance: acc.balance.toString(10),
            energy: acc.energy.toString(10),
            blockTime: acc.blockTime,
            firstSeen: acc.firstSeen,
            code: acc.code,
            master: acc.master,
            sponsor: acc.sponsor,
            suicided: acc.suicided
        })
    }

    private async account(addr: string) {
        if (this.acc.has(addr)) {
            return this.acc.get(addr)!
        }

        const acc = await this.manager.getRepository(Account).findOne({ address: addr })
        if (acc) {
            this.acc.set(addr, acc)
            this.takeSnap(acc)
            return acc
        } else {
            const newAcc = this.manager.create(Account, {
                address: addr,
                balance: BigInt(0),
                energy: BigInt(0),
                blockTime: this.block.timestamp,
                firstSeen: this.block.timestamp,
                code: null,
                master: null,
                sponsor: null,
                deployer: null,
                suicided: false
            })

            this.acc.set(addr, newAcc)
            this.takeSnap(newAcc)
            return newAcc
        }
    }

    private async getMaster(addr: string) {
        const ret = await this.thor.explain({
            clauses: [{
                to: PrototypeAddress,
                value: '0x0',
                data: prototype.master.encode(addr)
            }]
        }, this.block.id)
        const decoded = prototype.master.decode(ret[0].data)
        if (decoded['0'] === ZeroAddress) {
            return null
        } else {
            return decoded['0']
        }
    }
}
