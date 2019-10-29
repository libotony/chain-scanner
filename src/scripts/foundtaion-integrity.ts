import { initConnection } from '../db'
import { Persist } from '../foundation/persist'
import { getConnection } from 'typeorm'
import { Block } from '../db/entity/block'
import { displayID } from '../utils'

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
