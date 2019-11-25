import { EntityManager, getConnection, LessThan, In, MoreThan } from 'typeorm'
import { REVERSIBLE_WINDOW } from '../utils'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType } from '../explorer-db/types'

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
) => {
    if (!manager) {
        manager = getConnection().manager
    }

    // get [head-REVERSIBLE_WINDOW, head]
    const blockID = '0x' + BigInt(head - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0')
    return manager
        .getRepository(Snapshot)
        .find({
            where: {
                type,
                block: {
                    id: MoreThan(blockID)
                }
            },
            relations: ['block']
        })
}

export const removeSnapshot = (blockIDs: string[], type: SnapType, manager ?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Snapshot)
        .delete({
            blockID: In([...blockIDs]),
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
