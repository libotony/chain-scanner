import { EntityManager, getConnection, LessThan, In } from 'typeorm'
import { Block } from '../explorer-db/entity/block'
import { REVERSIBLE_WINDOW, bufferToHex } from '../utils'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType } from '../explorer-db/types'

export type RecentSnapshot = Snapshot & {isTrunk: boolean}

export const insertSnapshot = (snap: Snapshot, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager.insert(Snapshot, snap)
}

export const listRecentSnapshot = async (
    head: number,
    type: SnapType,
    manager?: EntityManager
): Promise<RecentSnapshot[]> => {
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
        .where('snap.type = :type', { type })
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

export const removeSnapshot = (blockIDs: string[], type: SnapType, manager ?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Snapshot)
        .delete({
            blockID: In(blockIDs),
            type
        })
}

export const  clearSnapShot = (blockNum: number, type: SnapType, manager ?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    // clear [0, head-REVERSIBLE_WINDOW)
    const blockID = '0x' + BigInt(blockNum - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0')
    return manager
        .getRepository(Snapshot)
        .delete({blockID: LessThan(blockID), type})
}
