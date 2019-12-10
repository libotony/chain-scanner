import { createConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { balanceOf, getVIP180Token } from '../../const'
import { TokenBalance } from '../../explorer-db/entity/token-balance'
import { AssetType } from '../../explorer-db/types'
import { Persist } from '../../processor/vip180/persist'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'
import { getBlockByNumber } from '../../service/block'
import { Block } from '../../explorer-db/entity/block'

const net = getNetwork()
const thor = new Thor(new Net(getThorREST()), net)
const token = getVIP180Token(thor.genesisID, process.argv[3] || 'OCE')
const persist = new Persist(token)

createConnection().then(async (conn) => {
    await checkNetworkWithDB(net)
    const { block, accounts } = await new Promise<{
        block: Block,
        accounts: TokenBalance[]
    }>((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const accs = await manager
                .getRepository(TokenBalance)
                .find({
                    where: { type: AssetType[token.symbol as keyof typeof AssetType] }
                })
            const b = (await getBlockByNumber(h))!
            resolve({block: b, accounts: accs})
        }).catch(reject)
    })
    let count = 0

    const head = block.id
    console.log('start checking...')
    for (const acc of accounts) {
        let chainBalance: bigint
        try {
            const ret = await thor.explain({
                clauses: [{
                    to:  token.address,
                    value: '0x0',
                    data: balanceOf.encode(acc.address)
                }]
            }, head)
            const decoded = balanceOf.decode(ret[0].data)

            chainBalance = BigInt(decoded.balance)
        } catch {
            continue
        }
        if (acc.balance !== chainBalance) {
            throw new Error(`Fatal: ${token.symbol} balance mismatch of Account(${acc.address}), want ${acc.balance} got ${chainBalance}`)
        }
        count++
        if (count % 1000 === 0) {
            console.log('checked ', count)
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
