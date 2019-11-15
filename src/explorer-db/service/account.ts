import { getConnection, EntityManager } from 'typeorm'
import { Account } from '../entity/account'
import { AssetMovement } from '../entity/movement'
import { hexToBuffer } from '../utils'
import { AssetType } from '../types'
import { Transaction } from '../entity/transaction'
import { Block } from '../entity/block'

export const getAccount = (addr: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Account)
        .findOne({ address: addr })
}

export const countAccountTransaction = (addr: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
    .getRepository(Transaction)
    .createQueryBuilder('tx')
    .leftJoin(Block, 'block', 'block.id = tx.blockID')
    .where('block.isTrunk = :isTrunk', { isTrunk: true })
    .andWhere('tx.origin = :origin', { origin: hexToBuffer(addr) })
    .getCount()
}

export const getAccountTransaction = (addr: string, offset: number, limit: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Transaction)
        .createQueryBuilder('tx')
        .leftJoin(Block, 'block', 'block.id = tx.blockID')
        .where('block.isTrunk = :isTrunk', { isTrunk: true })
        .andWhere('tx.origin = :origin', { origin: hexToBuffer(addr) })
        .orderBy('blockID', 'DESC')
        .addOrderBy('txIndex', 'DESC')
        .offset(offset)
        .limit(limit)
        .getMany ()
}

export const countAccountTransfer = (addr: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(AssetMovement)
        .createQueryBuilder('transfer')
        .where('transfer.sender = :address OR transfer.recipient = :address', { address: hexToBuffer(addr) })
        .getCount()
}

export const getAccountTransfer = (addr: string, offset: number, limit: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(AssetMovement)
        .createQueryBuilder('transfer')
        .where('transfer.sender = :address OR transfer.recipient = :address', { address: hexToBuffer(addr) })
        .orderBy('blockID', 'DESC')
        .addOrderBy('moveIndex', 'DESC')
        .addOrderBy('type', 'ASC')
        .offset(offset)
        .limit(limit)
        .getMany()
}

export const countAccountTransferByType = (addr: string, type: AssetType, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(AssetMovement)
        .createQueryBuilder('transfer')
        .where('(transfer.sender = :address OR transfer.recipient = :address) AND transfer.type = :type', {
            address: hexToBuffer(addr),
            type
        })
        .getCount()
}

export const getAccountTransferByType = (
    addr: string,
    type: AssetType,
    offset: number,
    limit: number,
    manager?: EntityManager
) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(AssetMovement)
        .createQueryBuilder('transfer')
        .where('(transfer.sender = :address OR transfer.recipient = :address) AND transfer.type = :type', {
            address: hexToBuffer(addr),
            type
        })
        .orderBy('blockID', 'DESC')
        .addOrderBy('moveIndex', 'DESC')
        .addOrderBy('type', 'ASC')
        .offset(offset)
        .limit(limit)
        .getMany()
}
