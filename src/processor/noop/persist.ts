
import { EntityManager, getConnection } from 'typeorm'
import { Config } from '../../explorer-db/entity/config'
import { Snapshot } from '../../explorer-db/entity/snapshot'

export type RecentSnapshot = Snapshot & { isTrunk: boolean }

export class Persist {
    private get HEAD_KEY() {
        return 'noop-head'
    }

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
}
