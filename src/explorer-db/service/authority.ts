import { getConnection, EntityManager, } from 'typeorm'
import { Authority } from '../entity/authority'
import { Block } from '../entity/block'
import { hexToBuffer } from '../utils'

export const getAuthority = (addr: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Authority)
        .findOne({ address: addr })
}

export const getSignedBlocks = (addr: string, offset: number, limit: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .createQueryBuilder()
        .where('block.signer = :signer', { signer: hexToBuffer(addr) })
        .andWhere('block.isTrunk = :isTrunk', {isTrunk: true})
        .orderBy('block.id', 'DESC')
        .offset(offset)
        .limit(limit)
        .getMany()
}
