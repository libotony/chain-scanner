import { getConnection, EntityManager, getRepository } from 'typeorm'
import { Config } from '../../db/entity/config'
import { Block } from '../../db/entity/block'
import { Transfer } from '../../db/entity/transfer'
import { Receipt } from '../../db/entity/receipt'
import { Account } from '../../db/entity/account'
import { Energy } from '../../db/entity/energy'
import { hexToBuffer } from '../../utils'

const HEAD_KEY = 'dual-token-head'

export class Persist {

    public saveHead(val: number, manager?: EntityManager) {
        console.log('-----save head:', val)
        if (!manager) {
            manager = getConnection().manager
        }

        const config = new Config()
        config.key = HEAD_KEY
        config.value = val.toString()

        return manager.save(config)
    }

    public async getHead(): Promise<number|null> {
        const head = await getConnection()
            .getRepository(Config)
            .findOne({ key: HEAD_KEY })
        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    }

    public getBest() {
        return getConnection()
            .getRepository(Block)
            .createQueryBuilder('block')
            .where(qb => {
                const sub = qb.subQuery().select('MAX(block.number)').from(Block, 'block')
                return 'number=' + sub.getQuery()
            })
            .andWhere('isTrunk=:isTrunk', { isTrunk: true })
            .getOne()
    }

    public listRecent(to: number) {
        return getConnection()
            .getRepository(Transfer)
            .createQueryBuilder('transfer')
            .leftJoinAndSelect(Block, 'block', 'transfer.blockID = block.id')
            .where('block.number >= :number', { number: to })
            .orderBy('block.number', 'ASC')
            .getMany()
    }

    public async getBlockReceipts(blockNum: number) {
        const block = await getConnection()
            .getRepository(Block)
            .findOne({ number: blockNum, isTrunk: true })

        if (block) {
            const receipts = await getConnection()
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

    public getAccount(addr: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Account)
            .findOne({ address: addr })
    }

    public insertVETMovements(transfers: Transfer[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Transfer, transfers)
    }

    public insertEnergyMovements(transfers: Energy[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Energy, transfers)
    }

    public saveAccounts(accs: Account[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(accs)
    }

}
