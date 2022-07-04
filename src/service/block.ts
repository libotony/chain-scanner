import { getConnection, EntityManager, MoreThanOrEqual, Equal, Not, Between, LessThanOrEqual, } from 'typeorm'
import { Block } from '../explorer-db/entity/block'
import { TransactionMeta } from '../explorer-db/entity/tx-meta'

export const getBest = (manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({
            where: { isTrunk: true },
            order: { id: 'DESC' }
        }) as Promise<Block>
}

export const getBlockByID = (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({ id: blockID })
}

export const getBlockByNumber = (num: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(Block)
        .findOne({ number: num, isTrunk: true })
}

export const getExpandedBlockByNumber = async (num: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    const block = await manager
        .getRepository(Block)
        .findOne({ number: num, isTrunk: true })

    if (!block) {
        return { block, txs: [] } as { block: Block | undefined, txs: TransactionMeta[] }
    }

    let txs: TransactionMeta[] = []
    if (block.txCount) {
        txs = await manager
            .getRepository(TransactionMeta)
            .find({
                where: { blockID: block.id },
                order: { seq: 'ASC' },
                relations: ['transaction']
            })
    }

    return { block, txs }
}

export const getExpandedBlockByID = async (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    const block = await manager
        .getRepository(Block)
        .findOne({ id: blockID })

    if (!block) {
        return { block, txs: [] } as { block: Block | undefined, txs: TransactionMeta[] }
    }

    let txs: TransactionMeta[] = []
    if (block.txCount) {
        txs = await manager
            .getRepository(TransactionMeta)
            .find({
                where: { blockID: block.id },
                order: { seq: 'ASC' },
                relations: ['transaction']
            })
    }

    return { block, txs }
}

// get a block which contains tx in the range of [from, to]
export const getNextBlockIDWithTx = async (from: number, to: number, manager?: EntityManager) =>{
    if (!manager) {
        manager = getConnection().manager
    }

    const b = await manager
        .getRepository(Block)
        .findOne({
            where: {
                number: Between(from, to),
                isTrunk: true,
                txCount: Not(0)
            },
            select: ['id']
        })

    if (b) {
        return b.id
    } else {
        return null
    }  
}

// get a block which contains reverted tx in the range of [from, to]
export const getNextBlockIDWithReverted = async (from: number, to: number, manager?: EntityManager) =>{
    if (!manager) {
        manager = getConnection().manager
    }

    const b = await manager
        .getRepository(Block)
        .findOne({
            where: {
                number: Between(from, to),
                isTrunk: true,
                revertCount: Not(0)
            },
            select: ['id']
        })

    if (b) {
        return b.id
    } else {
        return null
    }
}

// get a block which contains reverted tx in the range of [from, to] in descending order
export const getPrevBlockIDWithReverted = async (from: number, to: number, manager?: EntityManager) =>{
    if (!manager) {
        manager = getConnection().manager
    }

    const b = await manager
        .getRepository(Block)
        .findOne({
            where: {
                number: Between(from, to),
                isTrunk: true,
                revertCount: Not(0)
            },
            order: {
                number: 'DESC'
            },
            select: ['id']
        })

    if (b) {
        return b.id
    } else {
        return null
    }
}

export const getBlockTxList = async (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(TransactionMeta)
        .find({
            where: { blockID },
            order: { seq: 'ASC' },
            select: ['txID']
        })
}
