
import { initConnection } from '../db'
import { ClauseExtractor } from '../processor/clause'

const clauseExtractor = new ClauseExtractor()
let shutdown = false

initConnection().then(async (conn) => {
    clauseExtractor.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            clauseExtractor
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
