import { EntityManager, getConnection } from 'typeorm'
import { Config } from '../../db/entity/config'
import { Clause } from '../../db/entity/clause'
import { REVERSIBLE_WINDOW, hexToBuffer } from '../../utils'
import { Transaction } from '../../db/entity/transaction'

const HEAD_KEY = 'extract-clause-head'

export class Persist {

    public saveHead(val: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        const config = new Config()
        config.key = HEAD_KEY
        config.value = val.toString()

        return manager.save(config)
    }

    public async getHead(manager?: EntityManager): Promise<number | null> {
        if (!manager) {
            manager = getConnection().manager
        }

        const head = await manager
            .getRepository(Config)
            .findOne({ key: HEAD_KEY })
        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    }

    public insertClauses(clauses: Clause[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Clause, clauses)
    }

    public removeClauses(ids: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        const txIDQuery = manager
            .getRepository(Transaction)
            .createQueryBuilder('tx')
            .select('tx.txID')
            .where('tx.blockID IN(:...ids)', { ids: ids.map(x => hexToBuffer(x)) })

        return manager
            .createQueryBuilder()
            .delete()
            .from(Clause)
            .where('txID in (' + txIDQuery.getQuery() + ')')
            .setParameters(txIDQuery.getParameters())
            .execute()
    }

}
