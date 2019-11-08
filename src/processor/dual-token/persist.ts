import { getConnection, EntityManager, LessThan } from 'typeorm'
import { Config } from '../../db/entity/config'
import { Block } from '../../db/entity/block'
import { AssetMovement } from '../../db/entity/movement'
import { Account } from '../../db/entity/account'
import { hexToBuffer, bufferToHex, REVERSIBLE_WINDOW } from '../../utils'
import { Snapshot } from '../../db/entity/snapshot'
import { SnapType, AssetType } from '../../types'

const HEAD_KEY = 'dual-token-head'
export type RecentSnapshot = Snapshot & {isTrunk: boolean}

export class Persist {

    public saveHead(val: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        const config = new Config()
        config.key = HEAD_KEY
        config.value = val.toString()

        return manager.save(config)
    }

    public async getHead(manager?: EntityManager): Promise<number | null> {
        if (!manager) {
            manager = getConnection().manager
        }

        const head = await manager
            .getRepository(Config)
            .findOne({ key: HEAD_KEY })
        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    }

    public insertMovements(moves: AssetMovement[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(AssetMovement, moves)
    }

    public saveAccounts(accs: Account[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(accs)
    }

    public insertSnapshot(snap: Snapshot, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Snapshot, snap)
    }

    public async listRecentSnapshot(head: number, manager ?: EntityManager): Promise<RecentSnapshot[]> {
        if (!manager) {
            manager = getConnection().manager
        }

        const ret: RecentSnapshot[] = []

        // get [head-REVERSIBLE_WINDOW, head]
        const blockID = Buffer.from(BigInt(head - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0'), 'hex')
        const result = await manager
            .getRepository(Snapshot)
            .createQueryBuilder('snap')
            .leftJoinAndSelect(Block, 'block', 'snap.blockID = block.id')
            .where('snap.type = :type', { type: SnapType.DualToken })
            .andWhere('snap.blockID > :blockID', { blockID })
            .getRawMany()

        for (const r of result) {
            ret.push({
                id: r.snap_id,
                type: r.snap_type,
                blockID: bufferToHex(r.snap_blockID),
                data: JSON.parse(r.snap_data),
                isTrunk: !!r.block_isTrunk
            })
        }

        return ret
    }

    public removeMovements(ids: string[], manager ?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return  manager
            .createQueryBuilder()
            .delete()
            .from(AssetMovement)
            .where('blockID IN(:...ids)', { ids: ids.map(x => hexToBuffer(x)) })
            .andWhere('type IN (:...types)', {types: [AssetType.VET, AssetType.Energy]})
            .execute()
    }

    public removeSnapshot(blockIDs: string[], manager ?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .createQueryBuilder()
            .delete()
            .from(Snapshot)
            .where('blockID IN(:...ids)', { ids: blockIDs.map(x => hexToBuffer(x)) })
            .andWhere('type=:type', {type: SnapType.DualToken})
            .execute()
    }

    public clearSnapShot(blockNum: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // clear [0, head-REVERSIBLE_WINDOW)
        const blockID = '0x' + BigInt(blockNum - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0')
        return manager
            .getRepository(Snapshot)
            .delete({blockID: LessThan(blockID), type: SnapType.DualToken})
    }

}
