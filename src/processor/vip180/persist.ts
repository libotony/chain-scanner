
import { EntityManager, getConnection, In } from 'typeorm'
import { Config } from '../../explorer-db/entity/config'
import { AssetMovement } from '../../explorer-db/entity/movement'
import { AssetType } from '../../explorer-db/types'
import { TokenBalance } from '../../explorer-db/entity/token-balance'
import { Snapshot } from '../../explorer-db/entity/snapshot'
import { TokenBasic } from '../../const'

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
            .findOne({ address: addr, type: AssetType[this.token.symbol as keyof typeof AssetType] })
    }

    public saveMovements(movements: AssetMovement[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(AssetMovement, movements)
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
            .getRepository(AssetMovement)
            .delete({
                blockID: In([...ids]),
                asset: AssetType[this.token.symbol as keyof typeof AssetType]
            })
    }

}
