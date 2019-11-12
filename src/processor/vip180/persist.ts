
import { EntityManager, getConnection } from 'typeorm'
import { Config } from '../../db/entity/config'
import { AssetMovement } from '../../db/entity/movement'
import { TokenBasic, AssetType } from '../../types'
import { TokenBalance } from '../../db/entity/token-balance'
import { Snapshot } from '../../db/entity/snapshot'
import { hexToBuffer } from '../../utils'

export type RecentSnapshot = Snapshot & { isTrunk: boolean }

export class Persist {
    private get HEAD_KEY() {
        return `token-${this.token.symbol}-head`
    }

    constructor(readonly token: TokenBasic) {}

    public saveHead(val: number, manager?: EntityManager) {
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
            .findOne({ address: addr, type: AssetType[this.token.symbol] })
    }

    public insertMovements(movements: AssetMovement[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(AssetMovement, movements)
    }

    public saveAccounts(accs: TokenBalance[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(accs)
    }

    public removeMovements(ids: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .createQueryBuilder()
            .delete()
            .from(AssetMovement)
            .where('blockID IN(:...ids)', { ids: ids.map(x => hexToBuffer(x)) })
            .andWhere('type = :type', { type: AssetType[this.token.symbol] })
            .execute()
    }

}
