import { Thor } from '../thor-rest'
import { prototype, TransferEvent, totalSupply, getVIP180Token} from '../const'
import { displayID, getThorREST } from '../utils'
import { Net } from '../net'
import { getNetwork } from './network'

const net = getNetwork()

const thor = new Thor(new Net(getThorREST()), net)
const token = getVIP180Token(thor.genesisID, process.argv[3] || 'OCE')
console.log(token);

(async () => {
    let events = await thor.filterEventLogs({
        range: {unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
        options: {offset: 0, limit: 1},
        criteriaSet: [{address: token.address, topic0: prototype.$Master.signature}],
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
        options: {offset: 0, limit: 50},
        criteriaSet: [{address: token.address, topic0: TransferEvent.signature}],
        order: 'asc'
    })

    const formated = events.map(x => {
        return { decoded: TransferEvent.decode(x.data, x.topics), meta: x.meta  }
    }).map(x => `Block(${displayID(x.meta!.blockID)}): ${x.decoded._from} -> ${x.decoded._to}: ${x.decoded._value}`)

    console.log('first 5 transfer:')
    console.log(formated.join('\n'))
    process.exit(0)
})().catch((e) => {
    console.log(e)
    process.exit(-1)
})
