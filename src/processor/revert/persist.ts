
import { EntityManager, getConnection, MoreThan, MoreThanOrEqual } from 'typeorm'
import { REVERSIBLE_WINDOW } from '../../config'
import { Block } from '../../explorer-db/entity/block'
import { Config } from '../../explorer-db/entity/config'
import { Transaction } from '../../explorer-db/entity/transaction'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { VMError } from '../../explorer-db/types'

export class Persist {
    private get HEAD_KEY() {
        return 'revert-head'
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

    public updateVmError(txID: string, vmError: VMError, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Transaction)
            .update({ txID }, { vmError })
    }
}
