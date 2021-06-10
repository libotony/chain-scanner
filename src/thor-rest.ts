import '@vechain/connex'
import '@vechain/connex.driver'
import { Network } from './const'
import { Net } from './net'
import * as LRU from 'lru-cache'
import { blockIDtoNum, isBytes32 } from './utils'

export namespace Thor {
    export type ExpandedBlock =
        Omit<Required<Connex.Thor.Block>, 'transactions'> & {
            transactions: Array<Omit<Connex.Thor.Transaction, 'meta'> & Omit<Connex.Thor.Receipt, 'meta'>>
        }
    export type Block<T extends 'expanded' | 'regular'>
        = T extends 'expanded' ? ExpandedBlock : Required<Connex.Thor.Block>
    export type Transaction = Connex.Thor.Transaction
    export type Receipt = Connex.Thor.Receipt
    export type Account = Connex.Thor.Account
    export type Code = Connex.Thor.Code
    export type Storage = Connex.Thor.Storage
    export type Event = Connex.Thor.Event
    export type Transfer = Connex.Thor.Transfer
    export type VMOutput = Connex.Thor.VMOutput
    export interface CallTracerOutput {
        type: string,
        from: string,
        to: string,
        value: string,
        gas?: string,
        gasUsed?: string,
        output?: string
        input?: string,
        error?: string,
        calls?: CallTracerOutput[]
    }

}

export class Thor {
    private cache: LRU<string, any>
    private get headerValidator() {
        return (headers: Record<string, string>) => {
            const xGeneID = headers['x-genesis-id']
            if (xGeneID && xGeneID !== this.genesisID) {
                throw new Error(`responded 'x-genesis-id' not match`)
            }
        }
    }

    // default genesis ID to mainnet
    constructor(readonly net: Net, readonly genesisID = Network.MainNet) {
        this.cache = new LRU<string, any>(1024 * 4)
    }

    public async getBlock<T extends 'expanded' | 'regular'>(
        revision: string | number,
        type: T
    ): Promise<Thor.Block<T>|null> {
        const expanded = type === 'expanded'
        const cacheOrLoad = async (func: () => Promise<Thor.Block<T>|null>) => {
            if (revision === 'best') {
                return func()
            }

            const { key, IDKey } = ((): {key: string; IDKey: string} => {
                if (typeof revision === 'string' && isBytes32(revision)) {
                    return {
                        key: (expanded ? 'b-e' : 'b-r') + blockIDtoNum(revision).toString(),
                        IDKey: (expanded ? 'b-e' : 'b-r') + revision
                    }
                } else if (typeof revision === 'number') {
                    return {
                        key: (expanded ? 'b-e' : 'b-r') + revision.toString(),
                        IDKey: ''
                    }
                } else {
                    throw new Error('invalid block revision')
                }
            })()

            if (this.cache.has(key!)) {
                return this.cache.get(key!) as Thor.Block<T>
            } else if (!!IDKey && this.cache.has(IDKey)) {
                return this.cache.get(IDKey!) as Thor.Block<T>
            }

            const b = await func()
            // cache blocks 10 minutes earlier than now
            if (b) {
                if ((new Date().getTime() / 1000) - b.timestamp > 10 * 60) {
                    if (expanded) {
                        const regular = {
                            ...b,
                            transactions: (b as Thor.ExpandedBlock).transactions.map(x => x.id)
                        }
                        this.cache.set('b-r' + b.number, regular)
                        this.cache.set('b-r' + b.id, regular)

                        this.cache.set('b-e' + b.number, b)
                        this.cache.set('b-e' + b.id, b)
                    } else {
                        this.cache.set('b-r' + b.number, b)
                        this.cache.set('b-r' + b.id, b)
                    }
                }
            }
            return b
        }

        return cacheOrLoad(() => {
            return this.httpGet<Thor.Block<T>|null>(`blocks/${revision}`, { expanded })
        })
    }
    public getTransaction(id: string, head ?: string) {
        return this.httpGet<Thor.Transaction>(`transactions/${id}`, head ? { head } : {})
    }
    public getReceipt(id: string, head ?: string) {
        return this.httpGet<Thor.Receipt>(`transactions/${id}/receipt`, head ? { head } : {})
    }
    public async getAccount(addr: string, revision ?: string) {
        const get = () => {
            return this.httpGet<Thor.Account>(`accounts/${addr}`, revision ? { revision } : {})
        }
        if (revision && isBytes32(revision)) {
            const key = 'a' + revision + addr
            if (this.cache.has(key)) {
                return this.cache.get(key) as Thor.Account
            }

            const acc = await get()
            this.cache.set(key, acc)
            return acc
        }

        return get()
    }
    public getCode(addr: string, revision ?: string) {
        return this.httpGet<Thor.Code>(`accounts/${addr}/code`, revision ? { revision } : {})
    }
    public getStorage(addr: string, key: string, revision ?: string) {
        return this.httpGet<Thor.Storage>(`accounts/${addr}/storage/${key}`, revision ? { revision } : {})
    }

    public filterEventLogs(arg: Connex.Driver.FilterEventLogsArg) {
        return this.httpPost<Thor.Event[]>('logs/event', arg)
    }

    public filterTransferLogs(arg: Connex.Driver.FilterTransferLogsArg) {
        return this.httpPost<Thor.Event[]>('logs/transfer', arg)
    }

    public explain(arg: Connex.Driver.ExplainArg, revision: string) {
        return this.httpPost<Thor.VMOutput[]>('accounts/*', arg, { revision })
    }

    public traceClause(blockID: string, txIndex: number, clauseIndex = 0) {
        return this.httpPost<Thor.CallTracerOutput>('debug/tracers', {
            name: 'call',
            target: `${blockID}/${txIndex}/${clauseIndex}`
        })
    }

    public httpPost<T>(path: string, body: object, query ?: Record<string, string>): Promise < T > {
        return this.net.http('POST', path, {
            query,
            body,
            validateResponseHeader: this.headerValidator
        })
    }

    protected httpGet<T>(path: string, query ?: Record<string, any>): Promise < T > {
        return this.net.http('GET', path, {
            query,
            validateResponseHeader: this.headerValidator
        })
    }

}
