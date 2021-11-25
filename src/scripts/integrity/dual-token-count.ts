import { createConnection, getConnection, In } from 'typeorm'
import { Persist, TypeEnergyCount, TypeVETCount } from '../../processor/dual-token/persist'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getBlockByNumber } from '../../service/block'
import { Block } from '../../explorer-db/entity/block'
import { AggregatedMovement } from '../../explorer-db/entity/aggregated-move'
import { AssetType } from '../../explorer-db/types'
import { Counts } from '../../explorer-db/entity/counts'

const net = getNetwork()
const persist = new Persist()

createConnection().then(async (conn) => {
    await checkNetworkWithDB(net)

    const { block, cnts } = await new Promise<{
        block: Block,
        cnts: Counts[]
    }>((resolve, reject) => {
        conn.manager.transaction('SERIALIZABLE', async manager => {
            const h = (await persist.getHead(manager))!
            const b = (await getBlockByNumber(h, manager))!
            const cnts = await manager
                .getRepository(Counts)
                .find({type: In([TypeVETCount, TypeEnergyCount])})
            resolve({block: b, cnts: cnts})
        }).catch(reject)
    })
    const head =  block.number

    let count = 0
    console.log('start checking...')
    for (const cnt of cnts) {
        if (count % 100 === 0) {
            const h = (await persist.getHead(conn.manager))!
            if (h !== head) {
                throw new Error('head is moving, the job might be still running, exit!')
            }
        }

        let c1:number
        if (cnt.type === TypeVETCount) {
            c1  = await getConnection()
                .getRepository(AggregatedMovement)
                .count({ participant: cnt.address as string, asset: AssetType.VET })
        } else {
            c1  = await getConnection()
                .getRepository(AggregatedMovement)
                .count({ participant: cnt.address as string, asset: AssetType.VTHO })
        }
        const c2 = cnt.in + cnt.out + cnt.self
        
        if (c1 != c2) {
            throw new Error(`${cnt.address}: ${cnt.type===TypeVETCount?'VET':'VTHO'} transfer count not match, indexed: ${c2} but got ${c1}`)
        }

        count++
        if (count % 1000 === 0) {
            console.log('checked ', count)
        }
    }
    console.log('all done!')
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})
