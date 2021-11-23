import { EntityManager, getConnection } from 'typeorm'
import { Counts } from '../explorer-db/entity/counts'

export const saveCounts = (cnts: Counts[], manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager.save(cnts)
}