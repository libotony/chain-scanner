
import { initConnection } from '../db'
import { VIP180Transfer } from '../processor/vip180'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Thor } from '../thor-rest'
import { getVIP180Token } from '../const/tokens'
import { EHrT } from '../db/entity/movement'
import { totalSupply } from '../const'
import { getConnection } from 'typeorm'
import { TokenBalance } from '../db/entity/token-balance'
import { TokenType } from '../types'

const thor = new Thor(new SimpleNet('http://localhost:8669'))
let shutdown = false

class EHrTToken extends VIP180Transfer {
    protected async processGenesis() {
        const address = '0x8d8d8a0c77628926908dedaf3fbffce3d416fc2d'
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

const ehrtToken = new EHrTToken(thor, getVIP180Token(thor.genesisID, 'EHrT'), EHrT)

initConnection().then(async (conn) => {
    ehrtToken.start()
}).catch(console.log)

const signals: NodeJS.Signals[]  = ['SIGINT', 'SIGTERM', 'SIGQUIT']
signals.forEach(sig => {
    process.on(sig, (s) => {
        console.log(`got signal: ${s}, terminating`)
        if (!shutdown) {
            shutdown = true
            ehrtToken
                .stop()
                .then(() => {
                    process.exit(0)
                })
        }
    })
})
