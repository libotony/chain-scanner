import { getConnectionOptions, createConnection, EntityManager, getConnection } from 'typeorm'
import { countAccountTransaction, getAccount, getTokenBalance, getAccountTransaction, countAccountTransfer, getAccountTransfer, getAccountTransferByType } from './explorer-db/service/account'
import { getBest, getRecentBlocks, getBlockByID, getBlockByNumber, getBlockTransactions, getBlockReceipts } from './explorer-db/service/block'
import { AssetType, SnapType } from './explorer-db/types'
import { getAuthority } from './explorer-db/service/authority'
import { getTransaction, getReceipt } from './explorer-db/service/transaction'
import { getRecentTransfers } from './explorer-db/service/transfer'
import { removeSnapshot, listRecentSnapshot } from './processor/snapshot'
import { Snapshot } from './explorer-db/entity/snapshot'

Promise.resolve().then(async () => {
    const opt = await getConnectionOptions()
    await createConnection(Object.assign({}, opt, {
        logging: true,
        logger: undefined
    }))

    // const ret = await countAccountTransaction('0xDBE84597403B9AEC770AEF4A93A3065B3B58D306')
    // const ret = await getBest()
    // const ret = await getAccount('0x0000000000000000000004FD32E19E473CBCEBCE')
    // const ret = await getTokenBalance('0x000556E73A8E26B080338A06A5F2487811DC5489')
    // const ret = await countAccountTransaction('0xAE6220C4ADE7426B3EB43D87B54DE094D169BB12')
    // const ret = await getAccountTransaction('0xAE6220C4ADE7426B3EB43D87B54DE094D169BB12', 2, 3)
    // const ret = await countAccountTransfer('0xAE6220C4ADE7426B3EB43D87B54DE094D169BB12')
    // const ret = await getAccountTransfer('0xAE6220C4ADE7426B3EB43D87B54DE094D169BB12', 2, 3)
    // const ret = await getAccountTransferByType('0xAE6220C4ADE7426B3EB43D87B54DE094D169BB12', AssetType.Energy, 2, 3)
    // const ret = await getAuthority('0xDBE84597403B9AEC770AEF4A93A3065B3B58D306')
    // const ret = await getRecentBlocks(2)
    // const ret = await getBlockByID('0x0042a581cb7c7010883b1a899266d8a1607c38e0dfb42224276ea67d0956a4f1')
    // const ret = await getBlockByNumber(4367745)
    // const ret = await getBlockTransactions('0x00032D717210F7F7CF641CBEFB80ECBEABCAF62C04EE747985FA09A2721FB00F')
    // const ret = await getBlockReceipts('0x00032D717210F7F7CF641CBEFB80ECBEABCAF62C04EE747985FA09A2721FB00F')
    // const ret = await getTransaction('0x129cc53f5b3282bc323db4523457d48916da9288792216b44fee74beb4a179c6')
    // const ret = await getReceipt('0x129cc53f5b3282bc323db4523457d48916da9288792216b44fee74beb4a179c6')
    // const ret = await getRecentTransfers(3)

    // const ret = await listRecentSnapshot(4371285, SnapType.Authority)
    // console.log(ret.map(x => x.id))
    const ret = await getConnection().getRepository(Snapshot).findOne()
    console.log(ret)

    process.exit(0)
}).catch(console.log)
