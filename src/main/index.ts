import { Network, getVIP180Token } from '../const'
import { Foundation } from '../foundation'
import { Processor } from '../processor/processor'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'
import { DualToken } from '../processor/dual-token'
import { initConnection } from '../explorer-db'
import { VIP180Transfer } from '../processor/vip180'
import { MasterNode } from '../processor/master-node'
import { GasAdjustmentWatcher } from '../processor/gas-adjust'

const printUsage = (msg = '') => {
    process.stderr.write(`${msg ? msg + '\n\n' : ''}Usage: node index.js [Network][Task][...Args]
--------
Network:    [main|test]
Task:       [foundation|dual-token|token|authority|gas-adjust]
`)
    process.exit(-1)
}

if (process.argv.length < 4) {
    printUsage()
    process.exit(-1)
}

let net: Network
switch (process.argv[2]) {
    case 'main':
        net = Network.MainNet
        break
    case 'test':
        net = Network.TestNet
        break
    default:
        printUsage('invalid network')
}

const thor = new Thor(new SimpleNet('http://localhost:8669'), net!)

let task: Foundation | Processor
switch (process.argv[3]) {
    case 'foundation':
        task = new Foundation(thor)
        break
    case 'dual-token':
        task = new DualToken(thor)
        break
    case 'token':
        if (!process.argv[4]) {
            printUsage('token symbol needed')
        }
        try {
            const token = getVIP180Token(net!, process.argv[4])
            task =  new VIP180Transfer(thor, token)
        } catch (e) {
            printUsage(e.message)
        }
        break
    case 'authority':
        task = new MasterNode(thor)
        break
    case 'gas-adjust':
        task = new GasAdjustmentWatcher()
        break
    default:
        printUsage('invalid task name')
}
let shutdown =  false

initConnection().then(async () => {
    task.start()
}).catch(e => {
    process.stderr.write(`Start task(${process.argv[3]}) at Net(${process.argv[2]}): ` + (e as Error).stack + '\r\n')
})

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        process.stdout.write(`got signal: ${s}, terminating
`)
        if (!shutdown) {
            shutdown = true
            task.stop().then(() => {
                process.exit(0)
            })
        }
    })
})
