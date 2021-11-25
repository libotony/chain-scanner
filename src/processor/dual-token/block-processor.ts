import { Block } from '../../explorer-db/entity/block'
import { Account } from '../../explorer-db/entity/account'
import { Thor } from '../../thor-rest'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { displayID } from '../../utils'
import { EntityManager, Not, IsNull, In } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { SnapType } from '../../explorer-db/types'
import { ExtensionAddress, getForkConfig, PrototypeAddress, prototype, ZeroAddress, IstPreCompiledContract } from '../../const'
import * as logger from '../../logger'
import { Counts } from '../../explorer-db/entity/counts'
import { TypeEnergyCount, TypeVETCount } from './persist'

export interface SnapCount {
    in: number
    out: number
    self: number
}
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
    vetCount: SnapCount
    energyCount: SnapCount
}

export class BlockProcessor {
    public Movement: AssetMovement[] = []

    private acc = new Map<string, Account>()
    private cnt = new Map<string, Counts>()
    private snap = new Map<string, SnapAccount>()
    private updateCode = new Set<string>()
    private updateEnergy = new Set<string>()
    private suicided = new Set<string>()
    private updateMaster = new Map<string, { master: string|null; txOrigin: string }>()

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

    public async master(addr: string, newMaster: string, txOrigin: string) {
        const master = newMaster === ZeroAddress ? null : newMaster
        const acc = await this.account(addr)

        this.updateMaster.set(addr, { master, txOrigin })
        if (acc.code === null) {
            this.updateCode.add(addr)
        }
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

        if (move.sender === move.recipient) {
            this.cnt.get('v' + move.sender)!.self++
        } else {
            this.cnt.get('v' + move.sender)!.out++
            this.cnt.get('v' + move.recipient)!.in++
        }

        await this.touchEnergy(move.sender)
        await this.touchEnergy(move.recipient)
    }

    public async transferEnergy(move: AssetMovement) {
        this.Movement.push(move)

        await this.account(move.sender)
        await this.account(move.recipient)
        if (move.sender === move.recipient) {
            this.cnt.get('e' + move.sender)!.self++
        } else {
            this.cnt.get('e' + move.sender)!.out++
            this.cnt.get('e' + move.recipient)!.in++
        }

        if (move.amount !== BigInt(0)) {
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

    public counts() {
        const cnts: Counts[] = []
        const compare = (a: Counts, b: SnapCount): boolean => {
            if (a.in === b.in && a.out === b.out && a.self === b.self) {
                return true
            }
            return false
        }

        for (const [_, cnt] of this.cnt.entries()) {
            const snap = this.snap.get(cnt.address as string)!
            if (!compare(cnt, cnt.type === TypeVETCount ? snap.vetCount : snap.energyCount)) {
                cnts.push(cnt)
            }
        }

        return cnts
    }

    public async finalize() {
        for (const [_, acc] of this.acc.entries()) {
            if (this.updateEnergy.has(acc.address)) {
                const ret = await this.thor.getAccount(acc.address, this.block.id)
                acc.energy = BigInt(ret.energy)
                acc.blockTime = this.block.timestamp

                // contract suicided will trigger a energy-drain action if that contract has energy left
                // since we acquired the account obj from the blockchain, check it anyway
                if (acc.code !== null && ret.hasCode === false &&
                    acc.energy === BigInt(0) && acc.balance === BigInt(0)) {
                    this.suicided.add(acc.address)
                }
            }

            if (this.updateCode.has(acc.address)) {
                const code = await this.thor.getCode(acc.address, this.block.id)
                if (code && code.code !== '0x') {
                    acc.code = code.code

                    // if updateCode was triggered by updateMaster, it could be a contract deployment triggered by a contract
                    if (this.updateMaster.has(acc.address) && acc.deployer === null) {
                        acc.deployer = this.updateMaster.get(acc.address)!.txOrigin
                    }
                    // re-deploy contract, get account back to live(create2)
                    if (acc.suicided == true) {
                        acc.suicided = false
                    }
                }
            }

            if (this.updateMaster.has(acc.address)) {
                acc.master = this.updateMaster.get(acc.address)!.master
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

    public async checkSuicided() {
        const accounts = await this.manager
            .getRepository(Account)
            .find({
                code: Not(IsNull()) // might holding vet/energy after destructed
            })
        for (const acc of accounts) {
            const chainAcc = await this.thor.getAccount(acc.address, this.block.id)
            if (chainAcc.hasCode === false) {
                await this.destruct(acc.address)
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

    private takeSnap(acc: Account, vetCnt: Counts, energyCnt: Counts) {
        this.snap.set(acc.address, {
            address: acc.address,
            balance: acc.balance.toString(10),
            energy: acc.energy.toString(10),
            blockTime: acc.blockTime,
            firstSeen: acc.firstSeen,
            code: acc.code,
            master: acc.master,
            sponsor: acc.sponsor,
            suicided: acc.suicided,
            vetCount: { in: vetCnt.in, out: vetCnt.out, self: vetCnt.self },
            energyCount: { in: energyCnt.in, out: energyCnt.out, self: energyCnt.self },
        })
    }

    private async account(addr: string) {
        if (this.acc.has(addr)) {
            return this.acc.get(addr)!
        }

        const acc = await this.manager.getRepository(Account).findOne({ address: addr })
        if (acc) {
            const counts = await this.manager.getRepository(Counts).find({
                where: { address: addr, type: In([TypeVETCount, TypeEnergyCount]) },
            })

            let v: Counts | null = null
            let e: Counts | null = null

            for (const cnt of counts) {
                if (cnt.type === TypeVETCount) {
                    v = cnt
                }
                if (cnt.type === TypeEnergyCount) {
                    e = cnt
                }
            }

            if (v === null) {
                v = this.manager.create(Counts, {
                    address: addr,
                    type: TypeVETCount,
                    in: 0,
                    out: 0,
                    self: 0
                })
            }
            if (e === null) {
                e = this.manager.create(Counts, {
                    address: addr,
                    type: TypeEnergyCount,
                    in: 0,
                    out: 0,
                    self: 0
                })
            }

            this.cnt.set('v' + addr, v)
            this.cnt.set('e' + addr, e)

            this.acc.set(addr, acc)
            this.takeSnap(acc, v, e)
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

            let v = this.manager.create(Counts, {
                address: addr,
                type: TypeVETCount,
                in: 0,
                out: 0,
                self: 0
            })

            let e = this.manager.create(Counts, {
                address: addr,
                type: TypeEnergyCount,
                in: 0,
                out: 0,
                self: 0
            })
            this.cnt.set('v' + addr, v)
            this.cnt.set('e' + addr, e)

            this.acc.set(addr, newAcc)
            this.takeSnap(newAcc, v, e)
            return newAcc
        }
    }
}
