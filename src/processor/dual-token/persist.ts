import { getConnection, EntityManager, In } from 'typeorm'
import { Config } from '../../explorer-db/entity/config'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { Account } from '../../explorer-db/entity/account'
import { CountType } from '../../explorer-db/types'
import { Counts } from '../../explorer-db/entity/counts'
import { AssetType } from '../../types'

const HEAD_KEY = 'dual-token-head'
export const TypeVETCount = CountType.Transfer + AssetType.VET
export const TypeEnergyCount = CountType.Transfer + AssetType.VTHO

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

    public saveMovements(moves: AssetMovement[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(AssetMovement, moves)
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

        return manager
            .getRepository(AssetMovement)
            .delete({
                blockID: In([...ids]),
                asset: In( [AssetType.VET, AssetType.VTHO])
            })
    }

    public removeAccounts(accs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Account)
            .delete({
                address: In([...accs])
            })
    }

    public removeCounts(accs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Counts)
            .delete({
                address: In([...accs]),
                type: In([TypeVETCount, TypeEnergyCount])
            })
    }
}
