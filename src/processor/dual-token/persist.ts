import { getConnection, EntityManager, LessThan } from 'typeorm'
import { Config } from '../../db/entity/config'
import { Block } from '../../db/entity/block'
import { Transfer, Energy } from '../../db/entity/movement'
import { Receipt } from '../../db/entity/receipt'
import { Account } from '../../db/entity/account'
import { hexToBuffer, bufferToHex, REVERSIBLE_WINDOW } from '../../utils'
import { Snapshot } from '../../db/entity/snapshot'
import { SnapType } from '../../types'

const HEAD_KEY = 'dual-token-head'
export type RecentSnapshot = Snapshot & {isTrunk: boolean}

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

    public async getHead(manager?: EntityManager): Promise<number | null> {
        if (!manager) {
            manager = getConnection().manager
        }

        const head = await getConnection()
            .getRepository(Config)
            .findOne({ key: HEAD_KEY })
        if (head) {
            return parseInt(head.value, 10)
        } else {
            return null
        }
    }

    public getBest(manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

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

    public getBlock(blockNum: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Block)
            .findOne({ number: blockNum, isTrunk: true })
    }

    public async getBlockReceipts(blockNum: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        const block = await this.getBlock(blockNum, manager)

        if (block) {
            const receipts = await manager
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

    public saveSnapshot(snap: Snapshot, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.save(snap)
    }

    public async listRecentSnapshot(head: number, manager ?: EntityManager): Promise<RecentSnapshot[]> {
        if (!manager) {
            manager = getConnection().manager
        }

        const ret: RecentSnapshot[] = []

        // get [head-REVERSIBLE_WINDOW, head]
        const blockID = Buffer.from(BigInt(head - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0'), 'hex')
        const result = await manager
            .getRepository(Snapshot)
            .createQueryBuilder('snap')
            .leftJoinAndSelect(Block, 'block', 'snap.blockID = block.id')
            .where('snap.type = :type', { type: SnapType.DualToken })
            .andWhere('snap.blockID > :blockID', { blockID })
            .getRawMany()

        for (const r of result) {
            ret.push({
                id: r.snap_id,
                type: r.snap_type,
                blockID: bufferToHex(r.snap_blockID),
                data: JSON.parse(r.snap_data),
                isTrunk: !!r.block_isTrunk
            })
        }

        return ret
    }

    public async removeMovements(ids: string[], manager ?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        await manager
            .createQueryBuilder()
            .delete()
            .from(Transfer)
            .where('blockID IN(:...ids)', { ids: ids.map(x => hexToBuffer(x))})
            .execute()

        await manager
            .createQueryBuilder()
            .delete()
            .from(Energy)
            .where('blockID IN(:...ids)', { ids: ids.map(x => hexToBuffer(x))})
            .execute()

        return
    }

    public removeSnapshot(blockIDs: string[], manager ?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .createQueryBuilder()
            .delete()
            .from(Snapshot)
            .where('blockID IN(:...ids)', { ids: blockIDs.map(x => hexToBuffer(x)) })
            .andWhere('type=:type', {type: SnapType.DualToken})
            .execute()
    }

    public clearSnapShot(blockNum: number, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        // clear [0, head-REVERSIBLE_WINDOW)
        const blockID = '0x' + BigInt(blockNum - REVERSIBLE_WINDOW).toString(16).padStart(8, '0').padEnd(64, '0')
        return manager
            .getRepository(Snapshot)
            .delete({blockID: LessThan(blockID), type: SnapType.DualToken})
    }

}
