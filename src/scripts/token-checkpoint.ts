import { initConnection } from '../explorer-db'
import { AssetMovement } from '../explorer-db/entity/movement'
import { Config } from '../explorer-db/entity/config'
import { Snapshot } from '../explorer-db/entity/snapshot'
import { SnapType, AssetType } from '../explorer-db/types'
import { Thor } from '../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { getVIP180Token, Network } from '../const'
import { TokenBalance } from '../explorer-db/entity/token-balance'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const token = getVIP180Token(Network.MainNet, process.argv[2] || 'OCE')

initConnection().then(async (conn) => {
    await conn.getRepository(AssetMovement).delete({type: AssetType[token.symbol]})
    await conn.getRepository(TokenBalance).delete({type: AssetType[token.symbol]})
    await conn.getRepository(Snapshot).delete({type: SnapType.VIP180Token + AssetType[token.symbol]})
    await conn.getRepository(Config).delete({ key: `token-${token.symbol}-head`})
}).then(() => {
    process.exit()
}).catch(e => {
    console.log(e)
})
