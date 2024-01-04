import { EntityManager } from 'typeorm'
import { AssetConfig, updateTime } from '../tokens'
import { Config } from '../explorer-db/entity/config'

interface TokenConfig { 
    updateTime: number,
    config: object
}
const TOKEN_CONFIG_KEY = 'token-config'

export const updateTokenConfig = async (manager: EntityManager) => { 
    const conf = await manager
        .getRepository(Config)
        .findOne({ key: TOKEN_CONFIG_KEY })

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
    config.key = TOKEN_CONFIG_KEY
    config.value = JSON.stringify({
        updateTime,
        config: AssetConfig 
    } as TokenConfig)
    await manager.save(config)
}