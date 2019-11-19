import { Thor } from '../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { $Master, TransferEvent, totalSupply, getVIP180Token} from '../const'
import { displayID } from '../utils'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const token = getVIP180Token(thor.genesisID, process.argv[2] || 'OCE')
console.log(token);

(async () => {
    let events = await thor.filterEventLogs({
        range: {unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
        options: {offset: 0, limit: 1},
        criteriaSet: [{address: token.address, topic0: $Master.signature}],
        order: 'asc'
    })
    console.log('bornAt ', events[0].meta!.blockNumber)
    const birthNumber = events[0].meta!.blockNumber

    const ret = await thor.explain({
        clauses: [{
            to: token.address,
            value: '0x0',
            data: totalSupply.encode()
        }]
    }, birthNumber.toString())
    console.log('total supply:', totalSupply.decode(ret[0].data).supply)

    events = await thor.filterEventLogs({
        range: {unit: 'block', from: birthNumber, to: Number.MAX_SAFE_INTEGER },
        options: {offset: 0, limit: 5},
        criteriaSet: [{address: token.address, topic0: TransferEvent.signature}],
        order: 'asc'
    })

    const formated = events.map(x => {
        return { decoded: TransferEvent.decode(x.data, x.topics), meta: x.meta  }
    }).map(x => `Block(${displayID(x.meta!.blockID)}): ${x.decoded._from} -> ${x.decoded._to}: ${x.decoded._value}`)

    console.log('first 5 transfer:')
    console.log(formated.join('\n'))
})().catch(console.log)
