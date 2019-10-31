import { initConnection } from '../../db'
import { getConnection } from 'typeorm'
import { Thor } from '../../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { methodBalanceOf } from '../../const'
import { TokenBalance } from '../../db/entity/token-balance'
import { TokenType } from '../../types'
import { Persist } from '../../processor/vip180/persist'
import { getVIP180Token } from '../../const/tokens'
import { OCE } from '../../db/entity/movement'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
const token = getVIP180Token(thor.genesisID, 'OCE')
const persist = new Persist(token, OCE)

initConnection().then(async (conn) => {
    const head = await persist.getHead()
    const block = await thor.getBlock(head)

    let hasMore = true
    const step = 100
    let offset = 0
    for (; hasMore === true;) {

        const accs = await getConnection()
            .getRepository(TokenBalance)
            .createQueryBuilder()
            .where({type: TokenType.OCE})
            .offset(offset)
            .limit(step)
            .getMany()

        offset += step

        if (accs.length) {
            for (const acc of accs) {
                let chainBalance: bigint
                try {
                    const ret = await thor.explain({
                        clauses: [{
                            to:  token.address,
                            value: '0x0',
                            data: methodBalanceOf.encode(acc.address)
                        }]
                    }, block.id)
                    const decoded = methodBalanceOf.decode(ret[0].data)

                    chainBalance = BigInt(decoded.balance)
                } catch {
                    continue
                }
                if (acc.balance !== chainBalance) {
                    throw new Error(`Fatal: OCE balance mismatch of Account(${acc.address})`)
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
