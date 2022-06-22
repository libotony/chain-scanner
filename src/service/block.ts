import { getConnection, EntityManager, MoreThanOrEqual, Equal, Not, } from 'typeorm'
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

    const txs = await manager
        .getRepository(TransactionMeta)
        .find({
            where: { blockID: block.id },
            order: { seq: 'ASC' },
            relations: ['transaction']
        })

    return { block, txs }
}

// get a none-empty block from (number)[start,infinite) 
export const getNextExpandedBlock = async (start: number, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    const block = await manager
        .getRepository(Block)
        .findOne({ number: MoreThanOrEqual(start), isTrunk: true, txCount: Not(0) })

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

export const getBlockTxList = async (blockID: string, manager?: EntityManager) => {
    if (!manager) {
        manager = getConnection().manager
    }

    return manager
        .getRepository(TransactionMeta)
        .find({
            where: { blockID },
            order: { seq: 'ASC' },
            select: ["txID"]
        })
}
