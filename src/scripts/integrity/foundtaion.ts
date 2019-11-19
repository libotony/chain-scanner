import { initConnection } from '../../explorer-db'
import { Persist } from '../../foundation/persist'
import { getConnection, MoreThan } from 'typeorm'
import { Block } from '../../explorer-db/entity/block'
import { displayID, REVERSIBLE_WINDOW, blockIDtoNum } from '../../utils'
import { getBlockTransactions, getBlockReceipts } from '../../explorer-db/service/block'
import { Thor } from '../../thor-rest'
import { SimpleNet } from '@vechain/connex.driver-nodejs'

const STOP_NUMBER = 0
const persist = new Persist()
const thor = new Thor(new SimpleNet('http://localhost:8669'))

const getBlock = async (id: string) => {
    const block = await getConnection().getRepository(Block).findOne({ id })
    const txs = (await getBlockTransactions(id)).map(x => x.txID)
    const receipts = (await getBlockReceipts(id)).map(x => x.txID)

    return {block, txs, receipts}
}

initConnection().then(async () => {
    const head = (await persist.getHead())!
    const headNum = blockIDtoNum(head.value)

    const count = await getConnection().getRepository(Block).count({ number: MoreThan(headNum) })
    if (count) {
        throw new Error('larger number block exist than head')
    }
    const data = await getBlock(head.value)
    let current = data.block!

    for (; ;) {
        const { block, txs, receipts } = await getBlock(current.parentID)
        if (!block) {
            throw new Error(`continuity Block(${displayID(current.id)})'s parentID(${current.parentID}) missing`)
        }
        if ((block.timestamp < (new Date().getTime() / 1000 - REVERSIBLE_WINDOW * 10)) && !block.isTrunk) {
            throw new Error(`Block(${displayID(current.id)})'s in branch`)
        }
        try {
            const chainB = await thor.getBlock(block.id)
            for (const [index, tx] of chainB.transactions.entries()) {
                if (txs[index] !== tx) {
                    throw new Error(`Block(${displayID(current.id)})'s TX(#${index}) mismatch`)
                }
                if (receipts[index] !== tx) {
                    throw new Error(`Block(${displayID(current.id)})'s RECEIPT(#${index}) mismatch`)
                }
            }
        } catch {
            continue
        }
        if (block.number === STOP_NUMBER) {
            console.log('Finished integrity check')
            break
        }
        if (block.number % 1000 === 0) {
            console.log(`Processed to Block(${displayID(block.id)})`)
        }
        current = block
    }

    process.exit(0)
}). catch (e => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(1)
})
