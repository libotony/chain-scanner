import { getConnection, EntityManager, In } from 'typeorm'
import { Config } from '../../explorer-db/entity/config'
import { Authority } from '../../explorer-db/entity/authority'
import { AuthorityEvent } from '../../explorer-db/entity/authority-event'

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

    public getAll(manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager.getRepository(Authority)
            .find({})
    }

    public remove(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .delete({address: In(addrs)})
    }

    public setListed(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({
                address: In(addrs)
            }, {
                listed: true
            })
    }

    public setDeactivated(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({
                address: In(addrs)
            }, {
                active: false
            })
    }

    public setActivated(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({
                address: In(addrs)
            }, {
                active: true
            })
    }

    public setRevoked(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({
                address: In(addrs)
            }, {
                listed: false
            })
    }

    public setEndorsed(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({
                address: In(addrs)
            }, {
                endorsed: true
            })
    }

    public setUnendorsed(addrs: string[], manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({
                address: In(addrs)
            }, {
                endorsed: false
            })
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
