import { getConnection, EntityManager, LessThan } from 'typeorm'
import { Config } from '../../explorer-db/entity/config'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { Account } from '../../explorer-db/entity/account'
import { hexToBuffer} from '../../explorer-db/utils'
import { AssetType } from '../../explorer-db/types'

const HEAD_KEY = 'dual-token-head'

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

    public insertMovements(moves: AssetMovement[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(AssetMovement, moves)
    }

    public saveAccounts(accs: Account[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(accs)
    }

    public removeMovements(ids: string[], manager ?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return  manager
            .createQueryBuilder()
            .delete()
            .from(AssetMovement)
            .where('blockID IN(:...ids)', { ids: ids.map(x => hexToBuffer(x)) })
            .andWhere('type IN (:...types)', {types: [AssetType.VET, AssetType.Energy]})
            .execute()
    }

}
