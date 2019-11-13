import { getConnection, EntityManager, } from 'typeorm'
import { Account } from '../db/entity/account'
import { AssetMovement } from '../db/entity/movement'
import { hexToBuffer } from '../utils'

export const getAccount = (addr: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Account)
        .findOne({ address: addr })
}

export const listAccountTransfer = (addr: string, offset: number, limit: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(AssetMovement)
        .createQueryBuilder('transfer')
        .where('transfer.sender = :address', { address: hexToBuffer(addr) })
        .orWhere('transfer.recipient = :address',  { address: hexToBuffer(addr) })
        .orderBy('blockID', 'DESC')
        .addOrderBy('moveIndex', 'DESC')
        .offset(offset)
        .limit(limit)
        .getMany()
}
