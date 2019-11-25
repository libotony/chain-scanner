import { getConnection, EntityManager, } from 'typeorm'
import { Authority } from '../explorer-db/entity/authority'

export const getAuthority = (addr: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Authority)
        .findOne({ address: addr, listed: true })
}
