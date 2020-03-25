import { SnapType, AuthEvent } from '../../explorer-db/types'
import { blockIDtoNum, REVERSIBLE_WINDOW, BLOCK_INTERVAL, displayID, MAX_BLOCK_PROPOSERS } from '../../utils'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { ZeroAddress, AuthorityAddress, authority, ParamsAddress, params } from '../../const'
import { insertSnapshot, clearSnapShot, removeSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { EntityManager, getConnection } from 'typeorm'
import { Authority } from '../../explorer-db/entity/authority'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByID } from '../../service/block'
import { Buffer } from 'buffer'
import * as logger from '../../logger'
import { AuthorityEvent } from '../../explorer-db/entity/authority-event'
import { cry } from 'thor-devkit'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { Block } from '../../explorer-db/entity/block'

class Metric {
    private duration = BigInt(0)
    constructor(readonly name: string) { }
    public start() {
        const s = process.hrtime.bigint()
        return () => {
            this.duration += (process.hrtime.bigint() - s)
        }
    }
    public stats() {
        console.log(`Task[${this.name}] duration: ${this.duration / BigInt(1e6)}ms`)
        this.duration = BigInt(0)
    }
}
const dprpMetric = new Metric('DPRP')
const onoff = new Metric('ON/OFF')
const receipt = new Metric('Receipt')
const endorsement = new Metric('Endorsement')
const saveEvent =  new Metric('Save Event')

interface SnapAuthority {
    address: string,
    reward: string,
    signed: number,
    active: boolean,
}

const dprp = (blockNum: number, time: number): bigint => {
    const end = dprpMetric.start()
    const buff = Buffer.alloc(12)
    buff.writeUInt32BE(blockNum, 0)
    buff.writeBigUInt64BE(BigInt(time), 4)

    const hash = cry.blake2b256(buff)
    const b = hash.readBigUInt64BE()
    end()
    return b
}

const getSigner = (blockNum: number, time: number, actives: string[]) => {
    const nonce = dprp(blockNum, time)
    return actives[Number(nonce % BigInt(actives.length))]
}

export class MasterNodeWatcher extends Processor {

    protected get snapType() {
        return SnapType.Authority
    }
    private persist: Persist

    constructor(
        readonly thor: Thor,
    ) {
        super()
        this.persist = new Persist()
     }

    protected loadHead(manager?: EntityManager) {
        return this.persist.getHead(manager)
    }

    protected async saveHead(head: number, manager?: EntityManager) {
        await this.persist.saveHead(head, manager)
        return
    }

    protected bornAt() {
        return Promise.resolve(0)
    }

    protected enoughToWrite(count: number) {
        return count >= 50
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, saveSnapshot = false) {
        const parent = (await getBlockByID(block.parentID, manager))!
        const candidates = await this.persist.listAuthorityCandidates(manager)
        const unendorsed = await this.persist.listAuthorityUnendorsed(manager)
        const endorsor = {
            endorsed: new Map<string, string>(),
            unendorsed: new Map<string, string>()
        }
        const events: AuthorityEvent[] =  []
        const checkEndorsement: string[] = []

        for (const c of candidates) {
            endorsor.endorsed.set(c.endorsor, c.address)
        }
        for (const u of unendorsed) {
            endorsor.unendorsed.set(u.endorsor, u.address)
        }

        // 1. update block signer
        const signer = (await this.persist.getAuthority(block.signer, manager))!
        const snapData: SnapAuthority = {
            address: signer.address,
            reward: signer.reward.toString(10),
            signed: signer.signed,
            active: signer.active,
        }
        signer.reward = signer.reward + block.reward
        signer.signed += 1

        const oEnd = onoff.start()
        // 2. activate and deactivate
        const actives = candidates
            .filter(x => {
                return x.active === true || x.address === block.signer
            })
            .map(x => x.address)
        if (getSigner(block.number - 1, block.timestamp, actives) !== block.signer) {
            throw new Error('block signer mismatch')
        }
        if (!signer.active) {
            logger.log(`MasterNode(${signer.address}) [Activate] at Block(${displayID(block.id)})`)
            signer.active = true
            events.push(manager.create(AuthorityEvent, {
                blockID: block.id,
                address: signer.address,
                event: AuthEvent.Activate
            }))
        }

        let ts = block.timestamp - BLOCK_INTERVAL
        for (let i = 0; i < MAX_BLOCK_PROPOSERS && ts > parent.timestamp; i++) {
            const addr = getSigner(block.number - 1, ts, actives)
            if (addr !== block.signer) {
                events.push(manager.create(AuthorityEvent, {
                    blockID: block.id,
                    address: addr,
                    event: AuthEvent.Deactivate
                }))
                logger.log(`MasterNode(${addr}) [Deactivate] at Block(${displayID(block.id)})`)
            }
            ts = ts - BLOCK_INTERVAL
        }
        oEnd()

        const rEnd = receipt.start()
        // 3. handle block: added and revoked nodes & get endorsor VET movement
        for (const  meta of txs) {
            for (const [_, o] of meta.transaction.outputs.entries()) {
                for (const [__, e] of o.events.entries()) {
                    if (e.address === AuthorityAddress && e.topics[0] === authority.Candidate.signature) {
                        const decoded = authority.Candidate.decode(e.data, e.topics)
                        if (decoded.action === authority.added) {
                            const [node] = await this.get(decoded.nodeMaster, block.id)
                            const isEndorsed = await this.isEndorsed(node.endorsor, block.id)
                            if (isEndorsed) {
                                events.push(manager.create(AuthorityEvent, {
                                    blockID: block.id,
                                    address: node.master,
                                    event: AuthEvent.Endorsed
                                }))
                                logger.log(`MasterNode(${node.master}) [Endorsed] at Block(${displayID(block.id)})`)
                            } else {
                                events.push(manager.create(AuthorityEvent, {
                                    blockID: block.id,
                                    address: node.master,
                                    event: AuthEvent.Unendorsed
                                }))
                                logger.log(`MasterNode(${node.master}) [UnEndorsed] at Block(${displayID(block.id)})`)
                            }
                            const auth = manager.create(Authority, {
                                address: node.master,
                                endorsor: node.endorsor,
                                identity: node.identity,
                                listed: true,
                                active: true,
                                endorsed: isEndorsed,
                                reward: BigInt(0),
                                signed: 0
                            })
                            await this.persist.insertAuthorities([auth], manager)
                            events.push(manager.create(AuthorityEvent, {
                                blockID: block.id,
                                address: node.master,
                                event: AuthEvent.Added
                            }))
                            logger.log(`MasterNode(${node.master}) [Added] at Block(${displayID(block.id)})`)
                        } else {
                            const addr = decoded.nodeMaster
                            events.push(manager.create(AuthorityEvent, {
                                blockID: block.id,
                                address: addr,
                                event: AuthEvent.Revoked
                            }))
                            logger.log(`MasterNode(${addr}) [Revoked] at Block(${displayID(block.id)})`)
                        }
                    }
                }
                for (const [___, t] of o.transfers.entries()) {
                    if (endorsor.endorsed.has(t.sender)) {
                        checkEndorsement.push(t.sender)
                    }
                    if (endorsor.unendorsed.has(t.recipient)) {
                        checkEndorsement.push(t.recipient)
                    }
                }
            }
        }
        rEnd()

        const endorseEnd = endorsement.start()
        // 4. check endorsement
        for (const e of checkEndorsement) {
            const addr = (() => {
                if (endorsor.endorsed.has(e)) {
                    return (endorsor.endorsed.get(e))!
                }
                return (endorsor.unendorsed.get(e))!
            })()
            const endorsed = endorsor.endorsed.has(e)
            const isEndorsed = await this.isEndorsed(e, block.id)
            if (isEndorsed !== endorsed) {
                if (isEndorsed) {
                    events.push(manager.create(AuthorityEvent, {
                        blockID: block.id,
                        address: addr,
                        event: AuthEvent.Endorsed
                    }))
                    logger.log(`MasterNode(${addr}) [Endorsed] at Block(${displayID(block.id)})`)
                } else {
                    events.push(manager.create(AuthorityEvent, {
                        blockID: block.id,
                        address: addr,
                        event: AuthEvent.Unendorsed
                    }))
                    logger.log(`MasterNode(${addr}) [Unendorsed] at Block(${displayID(block.id)})`)
                }
            }
        }
        endorseEnd()

        const sEnd = saveEvent.start()

        await this.persist.saveAuthority(signer, manager)
        if (events.length) {
            await this.persist.insertAuthorityEvents(events, manager)

            // deactivate, revoke, endorsed, unendorsed
            const d = new Set<string>()
            const r = new Set<string>()
            const e = new Set<string>()
            const u = new Set<string>()
            for (const ev of events) {
                switch (ev.event) {
                    case AuthEvent.Deactivate:
                        d.add(ev.address)
                        break
                    case AuthEvent.Revoked:
                        r.add(ev.address)
                        break
                    case AuthEvent.Endorsed:
                        e.add(ev.address)
                        break
                    case AuthEvent.Unendorsed:
                        u.add(ev.address)
                        break
                    case AuthEvent.Added:
                        e.delete(ev.address)
                        u.delete(ev.address)
                        break
                }
            }
            if (d.size) {
                this.persist.deactivate(Array.from(d), manager)
            }
            if (r.size) {
                this.persist.revoke(Array.from(r), manager)
            }
            if (e.size) {
                this.persist.endorse(Array.from(e), manager)
            }
            if (u.size) {
                this.persist.unendorse(Array.from(u), manager)
            }
        }
        sEnd()

        if (saveSnapshot) {
            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = this.snapType
            snapshot.data = snapData
            await insertSnapshot(snapshot, manager)
        }

        if (block.number % 10000 === 0) {
            dprpMetric.stats()
            onoff.stats()
            receipt.stats()
            endorsement.stats()
            saveEvent.stats()
        }
        return 1 + events.length * 2
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < REVERSIBLE_WINDOW) {
            return
        }

        const snapshots = await listRecentSnapshot(head, this.snapType)

        if (snapshots.length) {
            for (; snapshots.length;) {
                if (snapshots[0].block.isTrunk === false) {
                    break
                }
                snapshots.shift()
            }
            if (snapshots.length) {
                const headNum = blockIDtoNum(snapshots[0].blockID) - 1
                const toRevert = snapshots.map(x => x.blockID)

                await getConnection().transaction(async (manager) => {

                    for (; snapshots.length;) {
                        const snap = snapshots.pop()!

                        const snapData = snap.data as SnapAuthority
                        const signer = (await this.persist.getAuthority(snapData.address, manager))!
                        signer.reward = BigInt(snapData.reward)
                        signer.signed = snapData.signed
                        signer.active = snapData.active
                        await this.persist.saveAuthority(signer, manager)
                        logger.log(`MasterNode(${snapData.address})'s Signed block reverted to ${snapData.signed} of Block(${displayID(snap.blockID)})`)

                        const events = await this.persist.listEventsByBlockID(snap.blockID, manager)
                        for (const e of events) {
                            if (e.event === AuthEvent.Added) {
                                await this.persist.remove([e.address], manager)
                            } else {
                                switch (e.event) {
                                    case AuthEvent.Revoked:
                                        await this.persist.list([e.address], manager)
                                        break
                                    case AuthEvent.Activate:
                                        if (e.address !== signer.address) {
                                            await this.persist.deactivate([e.address], manager)
                                        }
                                        break
                                    case AuthEvent.Deactivate:
                                        await this.persist.activate([e.address], manager)
                                        break
                                    case AuthEvent.Endorsed:
                                        await this.persist.unendorse([e.address], manager)
                                        break
                                    case AuthEvent.Unendorsed:
                                        await this.persist.endorse([e.address], manager)
                                        break
                                }
                            }
                        }
                        await this.persist.removeEventsByBlockID(snap.blockID, manager)
                    }

                    await removeSnapshot(toRevert, this.snapType, manager)
                    await this.saveHead(headNum, manager)
                    logger.log('-> revert to head: ' + headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, this.snapType)
    }

    protected async processGenesis() {
        const revision = this.thor.genesisID
        const nodes: Authority[] = []
        const events: AuthorityEvent[] = []

        let current = await this.first(revision)
        await getConnection().transaction(async (manager) => {
            for (; current !== ZeroAddress;) {
                const [node, next] = await this.get(current, revision)

                const isEndorsed = await this.isEndorsed(node.endorsor, revision)
                nodes.push(manager.create(Authority, {
                    address: node.master,
                    endorsor: node.endorsor,
                    identity: node.identity,
                    listed: true,
                    endorsed: isEndorsed,
                    active: true,
                    reward: BigInt(0),
                    signed: 0
                }))
                events.push(manager.create(AuthorityEvent, {
                    blockID: revision,
                    address: node.master,
                    event: AuthEvent.Added
                }))
                if (isEndorsed) {
                    events.push(manager.create(AuthorityEvent, {
                        blockID: revision,
                        address: node.master,
                        event: AuthEvent.Endorsed
                    }))
                } else {
                    events.push(manager.create(AuthorityEvent, {
                        blockID: revision,
                        address: node.master,
                        event: AuthEvent.Unendorsed
                    }))
                }
                current = next
            }

            if (nodes.length) {
                await this.persist.insertAuthorities(nodes, manager)
            }
            if (events.length) {
                await this.persist.insertAuthorityEvents(events, manager)
            }
            await this.saveHead(0, manager)
        })
        this.head = 0
    }

    private async first(revision: string) {
        const ret = await this.thor.explain({
            clauses: [{
                to: AuthorityAddress,
                value: '0x0',
                data: authority.first.encode()
            }]
        }, revision)
        return authority.first.decode(ret[0].data)['0'] as string
    }

    private async get(master: string, revision: string) {
        const ret = await this.thor.explain({
            clauses: [{
                to: AuthorityAddress,
                value: '0x0',
                data: authority.get.encode(master)
            }, {
                to: AuthorityAddress,
                value: '0x0',
                data: authority.next.encode(master)
            }]
        }, revision)
        const getRet = authority.get.decode(ret[0].data)
        const next = authority.next.decode(ret[1].data)['0']
        return [{master, listed: getRet.listed, endorsor: getRet.endorsor, identity: getRet.identity}, next]
    }

    private async isEndorsed(endorsor: string, revision: string) {
        const endorsement = BigInt(2500000) * BigInt(1e18)
        const acc = await this.thor.getAccount(endorsor, revision)
        return BigInt(acc.balance) >= endorsement
    }
}
