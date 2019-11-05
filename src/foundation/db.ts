import { EntityManager, getConnection } from 'typeorm'
import { Block } from '../db/entity/block'
import { Receipt } from '../db/entity/receipt'
import { hexToBuffer } from '../utils'

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

export const getBlock = (blockNum: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({ number: blockNum, isTrunk: true })
}

export const getBlockByID = (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({ id: blockID })
}

export const getBlockReceipts = async (blockNum: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    const block = await getBlock(blockNum, manager)

    if (block) {
        const receipts = await manager
            .getRepository(Receipt)
            .createQueryBuilder()
            .where('blockID = :blockID', { blockID: hexToBuffer(block.id) })
            .orderBy('txIndex', 'ASC')
            .getMany()
        return { block, receipts }
    } else {
        throw new Error('Block not found: ' + blockNum)
    }
}
