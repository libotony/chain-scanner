import * as LRU from 'lru-cache'
import { EntityManager, getConnection } from 'typeorm'
import { SnapType, AuthEvent } from '../../explorer-db/types'
import { Authority } from '../../explorer-db/entity/authority'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { AuthorityEvent } from '../../explorer-db/entity/authority-event'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { Block } from '../../explorer-db/entity/block'
import { AuthorityAddress, authority, ParamsAddress, params } from '../../const'
import { REVERSIBLE_WINDOW, MAX_BLOCK_PROPOSERS} from '../../config'
import * as logger from '../../logger'
import { Thor } from '../../thor-rest'
import { blockIDtoNum, displayID } from '../../utils'
import { insertSnapshot, clearSnapShot, removeSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { Processor } from '../processor'
import { Persist } from './persist'
import { ListAll, ListInactive } from './auth-utils'

interface SnapAuthority {
    address: string,
    reward: string,
    signed: number,
}

export class MasterNodeWatcher extends Processor {

    protected get snapType() {
        return SnapType.Authority
    }
    private persist: Persist
    private paramsCache = new LRU<string, BigInt>(1024)

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
        return Promise.resolve(1)
    }

    protected enoughToWrite(count: number) {
        return count >= 50
    }

    /**
     * @return inserted column number
     */
    protected async processBlock(block: Block, txs: TransactionMeta[], manager: EntityManager, saveSnapshot = false) {
        const nodes = await this.persist.getAll(manager)
        const inActivesNodes = await ListInactive(this.thor, block.id)

        const endorsorToMaster = {
            endorsed: new Map<string, string>(),
            unendorsed: new Map<string, string>()
        }
        const events: AuthorityEvent[] = []
        const pendingEndorsorCheck: string[] = []
        const inactive = new Set<string>()

        for (const n of inActivesNodes) {
            inactive.add(n.master)
        }

        // 1. update block signer
        const signer = (await this.persist.getAuthority(block.signer, manager))!
        const snapData: SnapAuthority = {
            address: signer.address,
            reward: signer.reward.toString(10),
            signed: signer.signed,
        }
        signer.reward = signer.reward + block.reward
        signer.signed += 1

        // 2. activate and deactivate
        let count = 0
        for (const n of nodes) {
           if (n.listed) {
               if (n.endorsed) {
                    endorsorToMaster.endorsed.set(n.endorsor, n.address)
                    if (count++ < MAX_BLOCK_PROPOSERS) {
                        if (n.active && inactive.has(n.address)) {
                            events.push(manager.create(AuthorityEvent, {
                                blockID: block.id,
                                address: n.address,
                                event: AuthEvent.Deactivate
                            }))
                            logger.log(`MasterNode(${n.address}) [Deactivate] at Block(${displayID(block.id)})`)
                        }
                        if (!n.active && !inactive.has(n.address)) {
                            events.push(manager.create(AuthorityEvent, {
                                blockID: block.id,
                                address: n.address,
                                event: AuthEvent.Activate
                            }))
                            logger.log(`MasterNode(${n.address}) [Activate] at Block(${displayID(block.id)})`)
                        }
                   }
               } else {
                   endorsorToMaster.unendorsed.set(n.endorsor, n.address)
                }
            }
        }

        // 3. handle block: added and revoked nodes & get endorsor VET movement
        let hasParamEvent = false
        for (const meta of txs) {
            for (const [_, o] of meta.transaction.outputs.entries()) {
                for (const [__, e] of o.events.entries()) {
                    if (e.address === ParamsAddress) {
                        hasParamEvent = true
                    }
                    if (e.address === AuthorityAddress && e.topics[0] === authority.Candidate.signature) {
                        const decoded = authority.Candidate.decode(e.data, e.topics)
                        if (decoded.action === authority.added) {
                            const [node] = await this.get(decoded.nodeMaster, block.id)
                            const isEndorsed = await this.checkEndorsed(node.endorsor, block.id)
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
                    if (endorsorToMaster.endorsed.has(t.sender)) {
                        pendingEndorsorCheck.push(t.sender)
                    }
                    if (endorsorToMaster.unendorsed.has(t.recipient)) {
                        pendingEndorsorCheck.push(t.recipient)
                    }
                }
            }
        }

        if (!hasParamEvent) {
            this.reuseParamsCache(block)
        }
        // 4. check endorsement
        for (const endorsor of pendingEndorsorCheck) {
            const master = (() => {
                if (endorsorToMaster.endorsed.has(endorsor)) {
                    return (endorsorToMaster.endorsed.get(endorsor))!
                }
                return (endorsorToMaster.unendorsed.get(endorsor))!
            })()
            const endorsed = endorsorToMaster.endorsed.has(endorsor)
            const isEndorsed = await this.checkEndorsed(endorsor, block.id)
            if (isEndorsed !== endorsed) {
                if (isEndorsed) {
                    events.push(manager.create(AuthorityEvent, {
                        blockID: block.id,
                        address: master,
                        event: AuthEvent.Endorsed
                    }))
                    logger.log(`MasterNode(${master}) [Endorsed] at Block(${displayID(block.id)})`)
                } else {
                    events.push(manager.create(AuthorityEvent, {
                        blockID: block.id,
                        address: master,
                        event: AuthEvent.Unendorsed
                    }))
                    logger.log(`MasterNode(${master}) [Unendorsed] at Block(${displayID(block.id)})`)
                }
            }
        }

        await this.persist.saveAuthority(signer, manager)
        if (events.length) {
            await this.persist.insertAuthorityEvents(events, manager)

            // activate, deactivate, revoke, endorsed, unendorsed
            const a = new Set<string>()
            const d = new Set<string>()
            const r = new Set<string>()
            const e = new Set<string>()
            const u = new Set<string>()
            for (const ev of events) {
                switch (ev.event) {
                    case AuthEvent.Activate:
                        a.add(ev.address)
                        break
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
            if (a.size) {
                await this.persist.setActivated(Array.from(a), manager)
            }
            if (d.size) {
                await this.persist.setDeactivated(Array.from(d), manager)
            }
            if (r.size) {
                await this.persist.setRevoked(Array.from(r), manager)
            }
            if (e.size) {
                await this.persist.setEndorsed(Array.from(e), manager)
            }
            if (u.size) {
                await this.persist.setUnendorsed(Array.from(u), manager)
            }
        }

        if (saveSnapshot) {
            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = this.snapType
            snapshot.data = snapData
            await insertSnapshot(snapshot, manager)
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
                        await this.persist.saveAuthority(signer, manager)
                        logger.log(`MasterNode(${snapData.address})'s Signed block reverted to ${snapData.signed} of Block(${displayID(snap.blockID)})`)

                        const events = await this.persist.listEventsByBlockID(snap.blockID, manager)
                        for (const e of events) {
                            switch (e.event) {
                                case AuthEvent.Added:
                                    await this.persist.remove([e.address], manager)
                                    break
                                case AuthEvent.Revoked:
                                    await this.persist.setListed([e.address], manager)
                                    break
                                case AuthEvent.Activate:
                                    await this.persist.setDeactivated([e.address], manager)
                                    break
                                case AuthEvent.Deactivate:
                                    await this.persist.setActivated([e.address], manager)
                                    break
                                case AuthEvent.Endorsed:
                                    await this.persist.setUnendorsed([e.address], manager)
                                    break
                                case AuthEvent.Unendorsed:
                                    await this.persist.setUnendorsed([e.address], manager)
                                    break
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

        const list = await ListAll(this.thor, revision)
        await getConnection().transaction(async (manager) => {
            for (const node of list) {
                const isEndorsed = await this.checkEndorsed(node.endorsor, revision)
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
        return [{ master, listed: getRet.listed, endorsor: getRet.endorsor, identity: getRet.identity }, next]
    }

    private async checkEndorsed(endorsor: string, revision: string) {
        let endorsement: BigInt
        const entry = this.paramsCache.get(revision)
        if (!entry) {
            const ret = await this.thor.explain({
                clauses: [{
                    to: ParamsAddress,
                    value: '0x0',
                    data: params.get.encode(params.keys.proposerEndorsement)
                }]
            }, revision)
            endorsement = BigInt(params.get.decode(ret[0].data)['0'])
            this.paramsCache.set(revision, endorsement)
        } else {
            endorsement = entry
        }

        const acc = await this.thor.getAccount(endorsor, revision)
        return BigInt(acc.balance) >= endorsement
    }

    private reuseParamsCache(block: Block) {
        const prev = this.paramsCache.get(block.parentID)
        if (!!prev) {
            this.paramsCache.set(block.id, prev)
        }
    }
}
