import { initConnection } from '../db'
import { MasterNode } from '../processor/master-node'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const master = new MasterNode(thor)
let shutdown = false

initConnection().then(async (conn) => {
    master.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            master
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
