import { initConnection } from '../db'
import { AssetMovement } from '../db/entity/movement'
import { Config } from '../db/entity/config'
import { Snapshot } from '../db/entity/snapshot'
import { SnapType, AssetType } from '../types'
import { Thor } from '../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { getVIP180Token } from '../const/tokens'
import { TokenBalance } from '../db/entity/token-balance'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const token = getVIP180Token(thor.genesisID, process.argv[2] || 'OCE')

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
