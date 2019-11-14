import { getConnection, EntityManager, } from 'typeorm'
import { Block } from '../entity/block'
import { Transaction } from '../entity/transaction'
import { hexToBuffer } from '../utils'
import { Receipt } from '../entity/receipt'

export const getBest = (manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .createQueryBuilder('block')
        .where('isTrunk=:isTrunk', { isTrunk: true })
        .orderBy('id', 'DESC')
        .limit(1)
        .getOne()
}

export const getRecentBlocks = (limit: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .createQueryBuilder()
        .where('block.isTrunk = :isTrunk', { isTrunk: true })
        .orderBy('block.id', 'DESC')
        .limit(limit)
        .getMany()
}

export const getBlockByID = (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({id: blockID})
}

export const getBlockByNumber = (num: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({number: num})
}

export const getBlockTransactions = async (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Transaction)
        .createQueryBuilder()
        .where('blockID = :blockID', { blockID: hexToBuffer(blockID) })
        .orderBy('txIndex', 'ASC')
        .getMany()
}

export const getBlockReceipts = async (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Receipt)
        .createQueryBuilder()
        .where('blockID = :blockID', { blockID: hexToBuffer(blockID) })
        .orderBy('txIndex', 'ASC')
        .getMany()
}
