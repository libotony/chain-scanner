
import { EntityManager, getConnection } from 'typeorm'
import { Config } from '../../db/entity/config'
import { TransferLog } from '../../db/entity/movement'
import { TokenBasic, TokenType } from '../../types'
import { TokenBalance } from '../../db/entity/token-balance'
import { Snapshot } from '../../db/entity/snapshot'

export class Persist {
    private get HEAD_KEY() {
        return `token-${this.token.symbol}-head`
    }

    constructor(readonly token: TokenBasic, readonly entityClass: new () => TransferLog) {}

    public saveHead(val: number, manager?: EntityManager) {
        console.log('-----save head:', val)
        if (!manager) {
            manager = getConnection().manager
        }

        const config = new Config()
        config.key = this.HEAD_KEY
        config.value = val.toString()

        return manager.save(config)
    }

    public async getHead(manager?: EntityManager): Promise<number | null> {
        if (!manager) {
            manager = getConnection().manager
        }

        const head = await manager
            .getRepository(Config)
            .findOne({ key: this.HEAD_KEY })
        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    }

    public getAccount(addr: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(TokenBalance)
            .findOne({ address: addr, type: TokenType[this.token.symbol] })
    }

    public insertMovements(movements: TransferLog[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(this.entityClass, movements)
    }

    public saveAccounts(accs: TokenBalance[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(accs)
    }

    public saveSnapshot(snap: Snapshot, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(snap)
    }

}
