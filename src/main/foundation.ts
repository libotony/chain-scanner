import { initConnection } from '../db'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { ChainWatcher } from '../chain-watcher'
import { Thor } from '../thor-rest'
import { Foundation } from '../foundation'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const foundation = new Foundation(thor)
const watcher = new ChainWatcher(thor)
let shutdown = false

initConnection().then(async () => {
    foundation.StartUp()

    watcher.on('NewHeads', (h) => {
        foundation.newHeads(h)
    })
    watcher.on('Fork', (f) => {
        foundation.fork(f)
    })

}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log('signal', s)
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
