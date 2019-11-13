import { getConnection, EntityManager } from 'typeorm'
import { Config } from '../../db/entity/config'
import { Authority } from '../../db/entity/authority'

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

    public revokeAuthority(address: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({address}, {listed: false})
    }

    public removeAuthority(address: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .delete({address})
    }

    public enableAuthority(address: string, manager?: EntityManager) {
        if (!manager) {
            manager = getConnection().manager
        }

        return manager
            .getRepository(Authority)
            .update({address}, {listed: true})
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
}
