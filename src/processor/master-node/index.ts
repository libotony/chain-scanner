import { SnapType } from '../../explorer-db/types'
import { blockIDtoNum } from '../../utils'
import { Thor } from '../../thor-rest'
import { Persist } from './persist'
import { ZeroAddress, AuthorityAddress, authority } from '../../const'
import { insertSnapshot, clearSnapShot, removeSnapshot, listRecentSnapshot } from '../../service/snapshot'
import { EntityManager, getConnection } from 'typeorm'
import { Authority } from '../../explorer-db/entity/authority'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { Processor } from '../processor'
import { getBlockByNumber, getBlockReceipts } from '../../service/block'

interface SnapAuthority {
    node?: {
        address: string,
        reward: string,
        signed: number
    },
    actions: Array<{
        address: string,
        type: CandidateType
    }>
}

enum CandidateType {
    Add = 0,
    Revoke
}

export class MasterNodeWatcher extends Processor {
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
    protected async processBlock(blockNum: number, manager: EntityManager, saveSnapshot = false) {
        const block = (await getBlockByNumber(blockNum, manager))!
        const receipts = await getBlockReceipts(block.id, manager)
        const actions = []
        for (const r of receipts) {
            for (const [_, o] of r.outputs.entries()) {
                for (const [__, e] of o.events.entries()) {
                    if (e.address === AuthorityAddress && e.topics[0] === authority.Candidate.signature) {
                        const decoded = authority.Candidate.decode(e.data, e.topics)
                        if (decoded.action === authority.added) {
                            actions.push({
                                address: decoded.nodeMaster,
                                type: CandidateType.Add
                            })
                            const [node] = await this.get(decoded.nodeMaster, block.id)
                            const auth = manager.create(Authority, {
                                address: node.master,
                                endorsor: node.endorsor,
                                identity: node.identity,
                                listed: true,
                                reward: BigInt(0),
                                signed: 0
                            })
                            await this.persist.insertAuthorities([auth], manager)
                        } else {
                            actions.push({
                                address: decoded.nodeMaster,
                                type: CandidateType.Revoke
                            })
                            await this.persist.revokeAuthority(decoded.nodeMaster, manager)
                        }
                    }
                }
            }
        }

        const authNode = (await this.persist.getAuthority(block.signer, manager))!
        const snapNode = {
            address: authNode.address,
            reward: authNode.reward.toString(10),
            signed: authNode.signed
        }

        authNode.reward = authNode.reward + block.reward
        authNode.signed += 1

        await this.persist.saveAuthority(authNode, manager)

        if (saveSnapshot) {
            const snapshot = new Snapshot()
            snapshot.blockID = block.id
            snapshot.type = SnapType.Authority
            snapshot.data = {
                node: snapNode,
                actions
            }
            await insertSnapshot(snapshot, manager)
        }

        return 1
    }

    protected async latestTrunkCheck() {
        let head = await this.getHead()

        if (head < 12) {
            return
        }

        const snapshots = await listRecentSnapshot(head, SnapType.Authority)

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

                        if (snapData.node) {
                            const auth = (await this.persist.getAuthority(snapData.node.address, manager))!
                            auth.reward = BigInt(snapData.node.reward)
                            auth.signed = snapData.node.signed
                            await this.persist.saveAuthority(auth, manager)
                        }

                        for (const a of snapData.actions) {
                            if (a.type === CandidateType.Add) {
                                await this.persist.removeAuthority(a.address, manager)
                            } else {
                                await this.persist.enableAuthority(a.address, manager)
                            }
                        }
                    }

                    await removeSnapshot(toRevert, SnapType.Authority, manager)
                    await this.saveHead(headNum, manager)
                    console.log('-> revert to head:', headNum)
                })

                this.head = headNum
            }
        }

        head = await this.getHead()
        await clearSnapShot(head, SnapType.Authority)
    }

    protected async processGenesis() {
        const nodes: Authority[] = []
        let current = await this.first('0')

        await getConnection().transaction(async (manager) => {
            for (; current !== ZeroAddress;) {
                const [node, next] = await this.get(current, '0')
                nodes.push(manager.create(Authority, {
                    address: node.master,
                    endorsor: node.endorsor,
                    identity: node.identity,
                    listed: true,
                    reward: BigInt(0),
                    signed: 0
                }))
                current = next
            }

            if (nodes.length) {
                await this.persist.insertAuthorities(nodes, manager)
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

}
