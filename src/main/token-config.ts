import { EntityManager } from 'typeorm'
import { AssetList, updateTime } from '../tokens'
import { Config } from '../explorer-db/entity/config'

interface TokenConfig { 
    updateTime: number,
    tokens: object
}
const TOKEN_LIST_KEY = 'token-list'

export const updateTokenConfig = async (manager: EntityManager) => { 
    const conf = await manager
        .getRepository(Config)
        .findOne({ key: TOKEN_LIST_KEY })

    if (conf) {
        try {
            const data = JSON.parse(conf.value) as TokenConfig
            //skip if update time is the same
            if (data.updateTime === updateTime) {
                return
            }
        } catch { }
    }

    const config = new Config()
    config.key = TOKEN_LIST_KEY
    config.value = JSON.stringify({
        updateTime,
        tokens: AssetList
    } as TokenConfig)
    await manager.save(config)
}