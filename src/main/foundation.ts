import { initConnection } from '../explorer-db'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'
import { Foundation } from '../foundation'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const foundation = new Foundation(thor)
let shutdown = false

initConnection().then(async () => {
    foundation.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            foundation
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
