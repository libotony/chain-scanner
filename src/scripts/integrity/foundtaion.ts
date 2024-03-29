import { Persist } from '../../foundation/persist'
import { getConnection, MoreThan, createConnection } from 'typeorm'
import { Block } from '../../explorer-db/entity/block'
import { displayID, blockIDtoNum, getThorREST } from '../../utils'
import { Thor } from '../../thor-rest'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getBlockByID, getBlockTxList } from '../../service/block'
import { REVERSIBLE_WINDOW } from '../../config'

const net = getNetwork()
const STOP_NUMBER = 0
const persist = new Persist()
const thor = new Thor(new Net(getThorREST()), net)

let checkTx = false
if (process.argv[3] && process.argv[3].toLowerCase() === 'yes') {
    checkTx = true
}

const getBlockFromREST = async (id: string) => {
    const b = await thor.getBlock(id, 'regular');
    (async () => {
        let pos = b
        for (let i = 0; i <= 10; i++) {
            pos = await thor.getBlock(pos!.parentID, 'regular')
        }
    })().catch()
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

    let current = head.value
    for (; ;) {
        const block = await getBlockByID(current)
        if (!block) {
            throw new Error(`Continuity failed: Block(${displayID(current)}) missing`)
        }
        if ((block.timestamp < (new Date().getTime() / 1000 - REVERSIBLE_WINDOW * 10)) && !block.isTrunk) {
            throw new Error(`Block(${displayID(current)}) in branch`)
        }
        let chainB: Thor.Block<'regular'>
        try {
            chainB = (await getBlockFromREST(block.id))!
        } catch {
            continue
        }

        if (block.txCount !== chainB.transactions.length) {
            throw new Error(`Block(${displayID(current)})'s TX count mismatch`)
        }

        if (checkTx && block.txCount) {
            const txs = await getBlockTxList(block.id)
            for (const [index, tx] of chainB.transactions.entries()) {
                if (txs[index].txID !== tx) {
                    throw new Error(`Block(${displayID(current)})'s TX(#${index}) mismatch`)
                }
            }
        }

        if (block.number === STOP_NUMBER) {
            console.log('Finished integrity check')
            break
        }
        if (block.number % 1000 === 0) {
            console.log(`Processed to Block(${displayID(block.id)})`)
        }
        current = block.parentID
    }

    process.exit(0)
}).catch((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(1)
})
