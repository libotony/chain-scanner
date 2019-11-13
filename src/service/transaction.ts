import { EntityManager, getConnection } from 'typeorm'
import { Block } from '../db/entity/block'
import { Transaction } from '../db/entity/transaction'
import { Receipt } from '../db/entity/receipt'
import { hexToBuffer } from '../utils'

export const getTransaction = (txID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Transaction)
        .createQueryBuilder('tx')
        .leftJoin(Block, 'block', 'block.id = tx.blockID')
        .where('block.isTrunk = :isTrunk', { isTrunk: true })
        .andWhere('tx.txID = :txID', { txID: hexToBuffer(txID) })
        .getOne()
}

export const getReceipt = (txID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Receipt)
        .createQueryBuilder('receipt')
        .leftJoin(Block, 'block', 'block.id = receipt.blockID')
        .where('block.isTrunk = :isTrunk', { isTrunk: true })
        .andWhere('receipt.txID = :txID', { txID: hexToBuffer(txID) })
        .getOne()
}
