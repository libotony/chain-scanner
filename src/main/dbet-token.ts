
import { initConnection } from '../db'
import { VIP180Transfer } from '../processor/vip180'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'
import { getVIP180Token } from '../const/tokens'
import { DBET } from '../db/entity/movement'
import { totalSupply } from '../const'
import { getConnection } from 'typeorm'
import { TokenBalance } from '../db/entity/token-balance'
import { TokenType } from '../types'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
let shutdown = false

class DBETToken extends VIP180Transfer {
    protected async processGenesis() {
        const address = '0x1b8ec6c2a45cca481da6f243df0d7a5744afc1f8'
        const blockRev = await this.bornAt()

        const ret = await this.thor.explain({
            clauses: [{
                to: this.token.address,
                value: '0x0',
                data: totalSupply.encode()
            }]
        }, blockRev.toString())

        const supply = totalSupply.decode(ret[0].data).supply

        const acc = getConnection()
            .manager
            .create(TokenBalance, {
                address,
                type: TokenType[this.token.symbol],
                balance: BigInt(supply)
            })

        await getConnection()
            .getRepository(TokenBalance)
            .save(acc)
    }
}

const dbetToken = new DBETToken(thor, getVIP180Token(thor.genesisID, 'DBET'), DBET)

initConnection().then(async (conn) => {
    dbetToken.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            dbetToken
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
