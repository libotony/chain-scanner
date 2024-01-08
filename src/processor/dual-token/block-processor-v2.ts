import { Block } from '../../explorer-db/entity/block'
import { Account } from '../../explorer-db/entity/account'
import { Thor } from '../../thor-rest'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { ENERGY_GROWTH_RATE, displayID } from '../../utils'
import { EntityManager, In, IsNull, Not } from 'typeorm'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { SnapType } from '../../explorer-db/types'
import { ExtensionAddress, getForkConfig, PrototypeAddress, prototype, ZeroAddress, IstPreCompiledContract } from '../../const'
import { Counts } from '../../explorer-db/entity/counts'
import { Persist, TypeEnergyCount, TypeVETCount } from './persist'
import { saveCounts } from '../../service/counts'
import { saveSnapshot } from '../../service/snapshot'

const b0 = BigInt(0)
const bE18 = BigInt(1e18)

export interface SnapCount {
    in: number
    out: number
    self: number
}

export interface SnapAccount {
    address: string
    balance: string
    energy: string
    generated: string
    paid: string
    blockTime: number
    firstSeen: number
    code: string | null
    master: string | null
    sponsor: string | null
    suicided: boolean
    vetCount: SnapCount
    energyCount: SnapCount
}

interface ProcessorAccount {
    snap: SnapAccount
    entity: Account
    vet: {
        add: bigint,
        sub: bigint,
    }
    energy: {
        add: bigint,
        sub: bigint,
        paid: bigint,
    }
    actions: {
        code: boolean
        suicide: boolean
    }
    sponsor: {
        selected: string
        sponsored: string
        unsponsored: string
    }
    master: {
        address: string | null
        origin: string
    }
    counts: {
        vet: Counts
        energy: Counts
    }
}

const takeSnap = (acc: ProcessorAccount) => {
    acc.snap = {
        address: acc.entity.address,
        balance: acc.entity.balance.toString(10),
        energy: acc.entity.energy.toString(10),
        generated: acc.entity.generated.toString(10),
        paid: acc.entity.paid.toString(10),
        blockTime: acc.entity.blockTime,
        firstSeen: acc.entity.firstSeen,
        code: acc.entity.code,
        master: acc.entity.master,
        sponsor: acc.entity.sponsor,
        suicided: acc.entity.suicided,
        vetCount: { in: acc.counts.vet.in, out: acc.counts.vet.out, self: acc.counts.vet.self },
        energyCount: { in: acc.counts.energy.in, out: acc.counts.energy.out, self: acc.counts.energy.self },
    }
}

const isSameCount = (a: Counts, b: SnapCount) => {
    if (a.in !== b.in || a.out !== b.out || a.self !== b.self) {
        return false
    }
    return true
}

const generate = (balance: bigint, from: number, current: number) => {
    if (from >= current) { 
        return BigInt(0)
    }

    return balance * BigInt(current-from) * ENERGY_GROWTH_RATE / bE18
}

export class BlockProcessorV2 {
    private store = new Map<string, ProcessorAccount>()
    private movements: AssetMovement[] = []

    constructor(
        readonly block: Block,
        readonly thor: Thor,
        readonly manager: EntityManager
    ) { }

    private async account(addr: string) {
        if (this.store.has(addr)) {
            return this.store.get(addr)!
        }

        const account = {
            vet: {
                add: BigInt(0),
                sub: BigInt(0),
            },
            energy: {
                add: BigInt(0),
                sub: BigInt(0),
                paid: BigInt(0),
            },
            actions: {
                code: false,
                suicide: false
            },
            master: {},
            sponsor: {},
            counts: {}
        } as unknown as ProcessorAccount
        const entity = await this.manager.getRepository(Account).findOne({ address: addr })
        if (entity) {
            account.entity = entity
            const counts = await this.manager.getRepository(Counts).find({
                where: { address: addr, type: In([TypeVETCount, TypeEnergyCount]) },
            })

            for (const cnt of counts) {
                if (cnt.type === TypeVETCount) {
                    account.counts.vet = cnt
                }
                if (cnt.type === TypeEnergyCount) {
                    account.counts.energy = cnt
                }
            }
        } else {
            account.entity = this.manager.create(Account, {
                address: addr,
                balance: BigInt(0),
                energy: BigInt(0),
                generated: BigInt(0),
                paid: BigInt(0),
                blockTime: this.block.timestamp,
                firstSeen: this.block.timestamp,
                code: null,
                master: null,
                sponsor: null,
                deployer: null,
                suicided: false
            })
        }

        if (!account.counts.vet) {
            account.counts.vet = this.manager.create(Counts, {
                address: addr,
                type: TypeVETCount,
                in: 0,
                out: 0,
                self: 0
            })
        }
        if (!account.counts.energy) {
            account.counts.energy = this.manager.create(Counts, {
                address: addr,
                type: TypeEnergyCount,
                in: 0,
                out: 0,
                self: 0
            })
        }
        takeSnap(account)

        this.store.set(addr, account)
        return account
    }

    public async prepare() {
        const forkConfig = getForkConfig(this.thor.genesisID)
        if (this.block.number === forkConfig.VIP191) {
            const acc = await this.account(ExtensionAddress)
            acc.actions.code = true
        }
        if (this.block.number === forkConfig.ETH_IST) {
            for (let addr of IstPreCompiledContract) {
                const acc = await this.account(addr)
                acc.actions.code = true
            }
        }
    }

    public async handlePreAlloc(addrs: string[]) {
        if (this.block.number !== 0) {
            throw new Error('calling genesisAccount is forbid in block #' + this.block.number)
        }

        for (const addr of addrs) {
            const acc = await this.account(addr)
            const remote = await this.thor.getAccount(acc.entity.address, this.block.id)

            acc.vet.add += BigInt(remote.balance)
            acc.energy.add += BigInt(remote.energy)
            if (remote.hasCode) {
                acc.actions.code = true
            }
        }
    }

    public async transferVET(move: AssetMovement) {
        const sender = await this.account(move.sender)
        const recipient = await this.account(move.recipient)

        sender.vet.sub += move.amount
        recipient.vet.add += move.amount

        if (move.sender === move.recipient) {
            sender.counts.vet.self++
        } else {
            sender.counts.vet.out++
            recipient.counts.vet.in++
        }

        this.movements.push(move)
    }

    public async transferEnergy(move: AssetMovement) {
        const sender = await this.account(move.sender)
        const recipient = await this.account(move.recipient)

        sender.energy.sub += move.amount
        recipient.energy.add += move.amount

        if (move.sender === move.recipient) {
            sender.counts.energy.self++
        } else {
            sender.counts.energy.out++
            recipient.counts.energy.in++
        }

        this.movements.push(move)
    }

    public async txFee(payer: string, fee: bigint) {
        const gasPayer = await this.account(payer)

        gasPayer.energy.paid += fee
    }

    public async reward(beneficiary: string, reward: bigint) {
        const acc = await this.account(beneficiary)

        acc.energy.add += reward
    }

    public async destruct(addr: string) {
        const acc = await this.account(addr)

        acc.actions.suicide = true
    }

    public async master(addr: string, newMaster: string, txOrigin: string) {
        const master = newMaster === ZeroAddress ? null : newMaster
        const acc = await this.account(addr)

        acc.master.address = master
        acc.master.origin = txOrigin
    }

    public async sponsorSelected(addr: string, sponsor: string) {
        const acc = await this.account(addr)

        acc.sponsor.selected = sponsor
    }

    public async unsponsored(addr: string, sponsor: string) {
        const acc = await this.account(addr)

        acc.sponsor.unsponsored = sponsor
    }

    public async sponsored(addr: string, sponsor: string) {
        const acc = await this.account(addr)

        acc.sponsor.sponsored = sponsor
    }

    public async checkDestruct() {
        const accounts = await this.manager
            .getRepository(Account)
            .find({
                code: Not(IsNull()) // might holding vet/energy after destructed
            })
        for (const acc of accounts) {
            const remote = await this.thor.getAccount(acc.address, this.block.id)
            if (remote.hasCode === false) {
                await this.destruct(acc.address)
            }
        }
    }

    public async finalize(persist: Persist, manager: EntityManager, snap = false) {
        const counts: Counts[] = []
        const accounts: Account[] = []
        const snapshots: SnapAccount[] = []

        for (const [_, item] of this.store.entries()) {
            if (!isSameCount(item.counts.vet, item.snap.vetCount)) {
                counts.push(item.counts.vet)
            }
            if (!isSameCount(item.counts.energy, item.snap.energyCount)) {
                counts.push(item.counts.energy)
            }

            if (item.vet.add > b0 || item.vet.sub > b0 ||
                item.energy.add > b0 || item.energy.sub > b0 || item.energy.paid > b0
            ) {
                let gen = b0
                // handle energy generation
                if (item.entity.balance > b0) {
                    gen = generate(item.entity.balance, item.entity.blockTime, this.block.timestamp)
                    item.entity.generated = item.entity.generated + gen
                }

                item.entity.blockTime = this.block.timestamp
                item.entity.paid = item.entity.paid + item.energy.paid
                item.entity.energy = item.entity.energy + gen + item.energy.add - item.energy.sub - item.energy.paid
                item.entity.balance = item.entity.balance + item.vet.add - item.vet.sub
                if (item.entity.energy < 0) {
                    throw new Error(`Fatal: VTHO balance under 0 of Account(${item.entity.address}) at Block(${displayID(this.block.id)})`)
                }
                if (item.entity.balance < 0) {
                    throw new Error(`Fatal: VET balance under 0 of Account(${item.entity.address}) at Block(${displayID(this.block.id)})`)
                }
            }

            if (item.master.origin) {
                item.entity.master = item.master.address
                if (item.entity.code === null) {
                    item.actions.code = true
                }
            }

            if (item.actions.code) {
                const code = await this.thor.getCode(item.entity.address, this.block.id)
                if (code && code.code !== '0x') {
                    item.entity.code = code.code
                }
                // if update code was triggered by new master event, it could be a contract deployment
                if (item.entity.firstSeen === this.block.timestamp && item.master.address && item.entity.deployer === null) {
                    item.entity.deployer = item.master.origin
                }
                // re-deploy contract, get account back to live(create2)
                if (item.entity.suicided == true) {
                    item.entity.suicided = false
                }
            }

            if (item.actions.suicide) {
                item.entity.code = null
                item.entity.master = null
                item.entity.sponsor = null
                item.entity.deployer = null
                item.entity.suicided = true
            }

            if (item.sponsor.selected) {
                item.entity.sponsor = item.sponsor.selected
            }

            if (item.sponsor.unsponsored) {
                if (item.entity.sponsor === item.sponsor.unsponsored) {
                    item.entity.sponsor = null
                }
            }

            if (item.sponsor.sponsored) {
                const ret = await this.thor.explain({
                    clauses: [{
                        to: PrototypeAddress,
                        value: '0x0',
                        data: prototype.currentSponsor.encode(item.entity.address)
                    }]
                }, this.block.id)

                const decoded = prototype.currentSponsor.decode(ret[0].data)
                const sponsor = decoded['0'] === ZeroAddress ? null : decoded['0'] as string

                if (sponsor && sponsor === item.sponsor.sponsored) {
                    item.entity.sponsor = sponsor
                }
            }

            accounts.push(item.entity)
            if (snap) {
                snapshots.push(item.snap)
            }
        }

        if (this.movements.length) {
            await persist.saveMovements(this.movements, manager)
        }
        if (counts.length) {
            await saveCounts(counts, manager)
        }
        if (accounts.length) {
            await persist.saveAccounts(accounts, manager)
        }
        if (snap && snapshots.length) {
            const snap = new Snapshot()
            snap.blockID = this.block.id
            snap.type = SnapType.DualToken
            snap.data = snapshots

            await saveSnapshot(snap, manager)
        }

        return this.movements.length + counts.length + accounts.length + (snap ? 1 : 0)
    }
}


