
import { initConnection } from '../db'
import { VIP180Transfer } from '../processor/vip180'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'
import { getVIP180Token } from '../const/tokens'
import { TransferLog, OCE, PLA, TIC, SNK, JUR, AQD, YEET } from '../db/entity/movement'

const getEntityClass = (symbol: string): (new () => TransferLog) => {
    switch (symbol) {
        case 'OCE':
            return OCE
        case 'PLA':
            return PLA
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
const token = getVIP180Token(thor.genesisID, process.argv[2] ? process.argv[2].toUpperCase() : null || 'OCE')

const tokenTransfer = new VIP180Transfer(thor, token, getEntityClass(token.symbol))
let shutdown = false

initConnection().then(async (conn) => {
    tokenTransfer.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            tokenTransfer
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
