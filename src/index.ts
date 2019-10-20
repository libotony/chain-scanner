import { initConnection } from './db'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { ChainWatcher } from './chain-watcher'
import { Thor } from './thor-rest'
import { Foundation } from './foundation'

initConnection().then(async () => {
    const thor = new Thor(new SimpleNet('http://localhost:8669'))
    const foundation = new Foundation(thor)
    const watcher = new ChainWatcher(thor)

    watcher.on('NewHeads', (h) => {
        if (h.length > 1) {
            console.log(h)
        }
        if (h.length === 1) {
            console.log(h[0].number, h[0].id)
        }
        foundation.newHeads(h)
    })
    watcher.on('Fork', (f) => {
        console.log('fork happened:')
        console.log(f)
        foundation.fork(f)
    })

}).catch(e => {
    console.log(e)
})
