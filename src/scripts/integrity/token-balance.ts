import { createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { balanceOf, getVIP180Token } from '../../const'
import { TokenBalance } from '../../explorer-db/entity/token-balance'
import { AssetType } from '../../explorer-db/types'
import { Persist } from '../../processor/vip180/persist'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'

const net = getNetwork()
const thor = new Thor(new Net(getThorREST()), net)
const token = getVIP180Token(thor.genesisID, process.argv[3] || 'OCE')
const persist = new Persist(token)

createConnection().then(async (conn) => {
    await checkNetworkWithDB(net)
    const head = (await persist.getHead())!
    const block = await thor.getBlock(head)

    let hasMore = true
    const step = 100
    let offset = 0
    for (; hasMore === true;) {

        const accs = await conn
            .getRepository(TokenBalance)
            .find({
                where: { type: AssetType[token.symbol as keyof typeof AssetType] },
                skip: offset,
                take: step
            })

        offset += step

        if (accs.length) {
            for (const acc of accs) {
                let chainBalance: bigint
                try {
                    const ret = await thor.explain({
                        clauses: [{
                            to:  token.address,
                            value: '0x0',
                            data: balanceOf.encode(acc.address)
                        }]
                    }, block.id)
                    const decoded = balanceOf.decode(ret[0].data)

                    chainBalance = BigInt(decoded.balance)
                } catch {
                    continue
                }
                if (acc.balance !== chainBalance) {
                    throw new Error(`Fatal: ${token.symbol} balance mismatch of Account(${acc.address}), want ${acc.balance} got ${chainBalance}`)
                }
            }
        } else {
            hasMore = false
        }

    }
    console.log('all done!')

}).then(() => {
    process.exit(0)
}).catch(e => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})
