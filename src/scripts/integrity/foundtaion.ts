import { Persist } from '../../foundation/persist'
import { getConnection, MoreThan, createConnection } from 'typeorm'
import { Block } from '../../explorer-db/entity/block'
import { displayID, REVERSIBLE_WINDOW, blockIDtoNum, getThorREST } from '../../utils'
import { Thor } from '../../thor-rest'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getBlockByID, getExpandedBlockByID } from '../../service/block'

const net = getNetwork()
const STOP_NUMBER = 0
const persist = new Persist()
const thor = new Thor(new Net(getThorREST()), net)

const getBlockFromREST = async (id: string) => {
    const b = await thor.getBlock(id, 'regular')
    const num = blockIDtoNum(id);
    (async () => {
        for (let i = 1; i <= 10; i++) {
            await thor.getBlock(num + i, 'regular')
        }
    })()
    return b
}

createConnection().then(async () => {
    await checkNetworkWithDB(net)

    const head = (await persist.getHead())!
    const headNum = blockIDtoNum(head.value)

    const count = await getConnection().getRepository(Block).count({ number: MoreThan(headNum) })
    if (count) {
        throw new Error('larger number block exist than head')
    }
    let current = await getBlockByID(head.value)
    if (!current) {
        throw new Error('cannot find block in the db ' + head.value)
    }

    for (; ;) {
        const { block, txs } = await getExpandedBlockByID(current.parentID)
        if (!block) {
            throw new Error(`continuity Block(${displayID(current.id)})'s parentID(${current.parentID}) missing`)
        }
        if ((block.timestamp < (new Date().getTime() / 1000 - REVERSIBLE_WINDOW * 10)) && !block.isTrunk) {
            throw new Error(`Block(${displayID(current.id)})'s in branch`)
        }
        try {
            const chainB = (await getBlockFromREST(block.id))!
            for (const [index, tx] of chainB.transactions.entries()) {
                if (txs[index].txID !== tx) {
                    throw new Error(`Block(${displayID(current.id)})'s TX(#${index}) mismatch`)
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
        current = block as Block
    }

    process.exit(0)
}). catch ((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(1)
})
