import { initConnection } from '../db'
import { getConnection } from 'typeorm'
import { Persist } from '../processor/dual-token/persist'
import { Thor } from '../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'
import { Account } from '../db/entity/account'

const persist = new Persist()

initConnection().then(async (conn) => {
    const thor = new Thor(new SimpleNet('http://localhost:8669'))
    const head = await persist.getHead()

    const block = await thor.getBlock(head)

    let hasMore = true
    const step = 10
    let offset = 0
    for (; hasMore === true;) {

        const accs = await getConnection()
            .getRepository(Account)
            .createQueryBuilder('account')
            .offset(offset)
            .limit(step)
            .getMany()

        offset += step

        if (accs.length) {
            for (const acc of accs) {
                const chainAcc = await thor.getAccount(acc.address, head.toString())
                if (acc.balance !== BigInt(chainAcc.balance)) {
                    throw new Error(`Fatal: balance mismatch of Account(${acc.address})`)
                }
                if (acc.blockTime < block.timestamp) {
                    acc.energy =
                        acc.energy
                        + BigInt(5000000000) * acc.balance * BigInt(block.timestamp - acc.blockTime)
                        / BigInt(1e18)
                }
                if (acc.energy !== BigInt(chainAcc.energy)) {
                    throw new Error(`Fatal: energy mismatch of Account(${acc.address}) chain:${chainAcc.energy} db:${acc.energy}`)
                }

                if (chainAcc.hasCode === true && acc.code === null) {
                    throw new Error(`Fatal: Account(${acc.address}) does not have code in DB`)
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
