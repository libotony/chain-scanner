import { createConnection, In } from 'typeorm'
import { Thor } from '../../thor-rest'
import { Net } from '../../net'
import { getNetwork, checkNetworkWithDB } from '../network'
import { getThorREST } from '../../utils'
import { Output } from '../../explorer-db/types'
import { TransactionMeta } from '../../explorer-db/entity/tx-meta'
import { LogItem, newIterator } from '../../foundation/log-traverser'
import { Transaction } from '../../explorer-db/entity/transaction'

const net = getNetwork()
const limit = 1000

createConnection().then(async (conn) => {
    const thor = new Thor(new Net(getThorREST()), net)
    await checkNetworkWithDB(net)

    const fixOverallIndex = async (tx: TransactionMeta) => {
        const receipt = await thor.getReceipt(tx.txID, tx.blockID)
        const outputs: Output[] = []


        for (let [clauseIndex, o] of receipt.outputs.entries()) {
            const output: Output = {
                contractAddress: o.contractAddress,
                events: [],
                transfers: []
            }

            if (o.events.length && o.transfers.length) {
                const tracer = await thor.traceClause(tx.blockID, tx.seq.txIndex, clauseIndex, false)
                try {
                    let logIndex = 0
                    for (const item of newIterator(tracer, o.events, o.transfers)) {
                        if (item.type === 'event') {
                            output.events.push({
                                ...(item as LogItem<'event'>).data,
                                overallIndex: logIndex++
                            })
                        } else {
                            output.transfers.push({
                                ...(item as LogItem<'transfer'>).data,
                                overallIndex: logIndex++
                            })
                        }
                    }
                } catch (e) {
                    console.log(`failed to re-organize logs(${tx.txID}),err: ${e.toString()}`)
                    let logIndex = 0
                    output.transfers = []
                    output.events = []
                    for (const t of o.transfers) {
                        output.transfers.push({
                            ...t,
                            overallIndex: logIndex++
                        })
                    }
                    for (const e of o.events) {
                        output.events.push({
                            ...e,
                            overallIndex: logIndex++
                        })
                    }
                }
            } else if (o.events.length) {
                for (let i = 0; i < o.events.length; i++) {
                    output.events.push({
                        ...o.events[i],
                        overallIndex: i
                    })
                }
            } else {
                for (let i = 0; i < o.transfers.length; i++) {
                    output.transfers.push({
                        ...o.transfers[i],
                        overallIndex: i
                    })
                }
            }
            outputs.push(output)
        }

        await conn
            .getRepository(Transaction)
            .update({
                txID: tx.txID
            }, {
                outputs: outputs
            })
    }

    let offset = 0
    let count = 0
    let corrected = 0
    for (; ;) {
        const ids = await conn
            .getRepository(TransactionMeta)
            .find({
                select: ['txID'],
                order: { seq: 'ASC' },
                skip: offset,
                take: limit,
            })
        if (!ids.length) {
            console.log(`Finished, count:${count}, corrected:${corrected}`)
            break
        }
        count += ids.length

        const txs = await conn
            .getRepository(TransactionMeta)
            .find({
                where: { txID: In(ids.map(x => x.txID)) },
                order: { seq: 'ASC' },
                relations: ['transaction']
            })
        offset += limit
        for (let tx of txs) {
            if (!tx.transaction.reverted) {
                for (let [index, _] of tx.transaction.clauses.entries()) {
                    const op = tx.transaction.outputs[index]
                    if (op.events.length && op.transfers.length) {
                        const ei = op.events[op.events.length - 1].overallIndex!
                        const ti = op.transfers[op.transfers.length - 1].overallIndex!
                        const max = ei > ti ? ei : ti

                        if (op.events.length + op.transfers.length != max + 1) {
                            console.log(`Correcting ${tx.txID} at clause(${index})`)
                            await fixOverallIndex(tx)
                            corrected += 1
                            break
                        }
                    }
                }
            }
        }
    }
}).then(() => {
    process.exit(0)
}).catch((e: Error) => {
    console.log('Integrity check: ')
    console.log(e)
    process.exit(-1)
})

