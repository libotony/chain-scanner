import { initConnection } from '../db'
import { DualToken } from '../processor/dual-token'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const dualToken = new DualToken(thor)
let shutdown = false

initConnection().then(async (conn) => {
    dualToken.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            dualToken
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
