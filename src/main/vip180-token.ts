import { initConnection } from '../db'
import { VIP180Transfer } from '../processor/vip180'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'
import { getVIP180Token } from '../const/tokens'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const token = getVIP180Token(thor.genesisID, process.argv[2] || 'OCE')

const tokenTransfer = new VIP180Transfer(thor, token)
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
