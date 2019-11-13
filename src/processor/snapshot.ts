import { EntityManager, getConnection, LessThan } from 'typeorm'
import { Block } from '../db/entity/block'
import { hexToBuffer, REVERSIBLE_WINDOW, bufferToHex } from '../utils'
import { Snapshot } from '../db/entity/snapshot'
import { SnapType } from '../types'

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
        .createQueryBuilder()
        .delete()
        .from(Snapshot)
        .where('blockID IN(:...ids)', { ids: blockIDs.map(x => hexToBuffer(x)) })
        .andWhere('type=:type', { type })
        .execute()
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
