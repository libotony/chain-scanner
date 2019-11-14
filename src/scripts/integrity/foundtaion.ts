import { initConnection } from '../../explorer-db'
import { Persist } from '../../foundation/persist'
import { getConnection } from 'typeorm'
import { Block } from '../../explorer-db/entity/block'
import { displayID, REVERSIBLE_WINDOW } from '../../utils'

const STOP_NUMBER = 0
const persist = new Persist()
const getBlock = (id: string) => {
    return getConnection()
        .getRepository(Block)
        .findOne({ id })
}

initConnection().then(async (conn) => {
    const head = await persist.getHead()

    let current = await getBlock(head.value)

    for (; ;) {
        const b = await getBlock(current.parentID)
        if (!b) {
            throw new Error(`continuity Block(${displayID(current.id)})'s parentID(${current.parentID}) missing`)
        }
        if ((b.timestamp < (new Date().getTime() / 1000 - REVERSIBLE_WINDOW * 10)) && !b.isTrunk) {
            throw new Error(`Block(${displayID(current.id)})'s in branch`)
        }
        if (b.number === STOP_NUMBER) {
            console.log('Finished integrity check')
            break
        }
        if (b.number % 1000 === 0) {
            console.log(`Processed to Block(${displayID(b.id)})`)
        }
        current = b
    }

    process.exit(0)
}).catch(e => {
    console.log('Integrity check: ')
    console.log(e)
})
