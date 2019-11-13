import { EntityManager, getConnection } from 'typeorm'
import { AssetMovement } from '../db/entity/movement'

export const getRecentTransfers = (limit: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(AssetMovement)
        .createQueryBuilder()
        .orderBy('blockID', 'DESC')
        .addOrderBy('moveIndex', 'DESC')
        .limit(limit)
        .getMany()
}
