import { getConnection, EntityManager } from 'typeorm'
import { Config } from '../../explorer-db/entity/config'
import { Authority } from '../../explorer-db/entity/authority'
import { AuthorityEvent } from '../../explorer-db/entity/authority-event'
import { MAX_BLOCK_PROPOSERS } from '../../utils'

const HEAD_KEY = 'authority-head'

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

    public insertAuthorities(auth: Authority[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(Authority, auth)
    }

    public removeAuthority(address: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .delete({address})
    }

    public getAuthority(address: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .findOne({address})
    }

    public saveAuthority(auth: Authority, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .save(auth)
    }

    public listAuthorityCandidates(manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .find({
                where: {
                    listed: true,
                    endorsed: true,
                },
                take: MAX_BLOCK_PROPOSERS
            })
    }

    public listAuthorities(manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .find({
                where: {
                    listed: true,
                }
            })
    }

    public insertAuthorityEvents(events: AuthorityEvent[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.insert(AuthorityEvent, events)
    }

    public listEventsByBlockID(id: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(AuthorityEvent)
            .find({blockID: id})
    }

    public removeEventsByBlockID(id: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(AuthorityEvent)
            .delete({blockID: id})
    }
}
