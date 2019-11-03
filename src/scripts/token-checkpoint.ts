import { initConnection } from '../db'
import { TransferLog, OCE, PLA, EHrT, DBET, TIC, SNK, JUR, AQD, YEET } from '../db/entity/movement'
import { Config } from '../db/entity/config'
import { Snapshot } from '../db/entity/snapshot'
import { SnapType, TokenType } from '../types'
import { Thor } from '../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { getVIP180Token } from '../const/tokens'
import { TokenBalance } from '../db/entity/token-balance'

const getEntityClass = (symbol: string): (new () => TransferLog) => {
    switch (symbol) {
        case 'OCE':
            return OCE
        case 'PLA':
            return PLA
        case 'EHrT':
            return EHrT
        case 'DBET':
            return DBET
        case 'TIC':
            return TIC
        case 'SNK':
            return SNK
        case 'JUR':
            return JUR
        case 'AQD':
            return AQD
        case 'YEET':
            return YEET
        default:
            throw new Error('entity not found')
    }
}
const thor = new Thor(new SimpleNet('http://localhost:8669'))
const token = getVIP180Token(thor.genesisID, process.argv[2] || 'OCE')

initConnection().then(async (conn) => {
    await conn.getRepository(getEntityClass(token.symbol)).clear()
    await conn.getRepository(TokenBalance).delete({type: TokenType[token.symbol]})
    await conn.getRepository(Snapshot).delete({type: SnapType.VIP180Token + TokenType[token.symbol]})
    await conn.getRepository(Config).delete({ key: `token-${token.symbol}-head`})
}).then(() => {
    process.exit()
}).catch(e => {
    console.log(e)
})
