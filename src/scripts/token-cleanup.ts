import { AssetMovement } from '../explorer-db/entity/movement'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType, AssetType, CountType } from '../explorer-db/types'
import { getVIP180Token, Network } from '../const'
import { TokenBalance } from '../explorer-db/entity/token-balance'
import { createConnection, getConnectionOptions } from 'typeorm'
import { Counts } from '../explorer-db/entity/counts'

const token = getVIP180Token(Network.MainNet, process.argv[2] || 'OCE')

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    const conn = await createConnection(Object.assign({}, opt, {
      logging: true,
      logger: undefined
   }))
    await conn.getRepository(AssetMovement).delete({asset: AssetType[token.symbol as keyof typeof AssetType]})
    await conn.getRepository(TokenBalance).delete({ type: AssetType[token.symbol as keyof typeof AssetType] })
    await conn.getRepository(Counts).delete({type: CountType.Transfer+ AssetType[token.symbol as keyof typeof AssetType]})
    await conn.getRepository(Snapshot).delete({
        type: SnapType.VIP180Token + AssetType[token.symbol as keyof typeof AssetType]
    })
    await conn.getRepository(Config).delete({ key: `token-${token.symbol}-head`})
}).then(() => {
    process.exit()
}).catch(e => {
    console.log(e)})
