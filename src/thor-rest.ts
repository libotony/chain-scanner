import '@vechain/connex'
import '@vechain/connex.driver'
import { Network } from './const'
import { Net } from './net'

export type ExpandedBlock =
    Omit<Required<Connex.Thor.Block>, 'transactions'> & {
        transactions: Array<Omit<Connex.Thor.Transaction, 'meta'> & Omit<Connex.Thor.Receipt, 'meta'>>
    }
export type Block<T extends 'expanded'|'regular'> = T extends 'expanded' ? ExpandedBlock : Required<Connex.Thor.Block>

export class Thor {

    private get headerValidator() {
        return (headers: Record<string, string>) => {
            const xGeneID = headers['x-genesis-id']
            if (xGeneID && xGeneID !== this.genesisID) {
                throw new Error(`responded 'x-genesis-id' not match`)
            }
        }
    }
    // default genesis ID to mainnet
    constructor(readonly net: Net, readonly genesisID = Network.MainNet) { }

    public getBlock<T extends 'expanded' | 'regular'>(revision: string | number, type: T): Promise<Block<T>> {
        if (type === 'expanded') {
            return this.httpGet<Block<T>>(`blocks/${revision}`, { expanded: true })
        } else {
            return this.httpGet<Block<T>>(`blocks/${revision}`, { expanded: false })
        }

    }
    public getTransaction(id: string, head ?: string) {
        return this.httpGet<Connex.Thor.Transaction>(`transactions/${id}`, head ? { head } : {})
    }
    public getReceipt(id: string, head ?: string) {
        return this.httpGet<Connex.Thor.Receipt>(`transactions/${id}/receipt`, head ? { head } : {})
    }
    public getAccount(addr: string, revision ?: string) {
        return this.httpGet<Connex.Thor.Account>(`accounts/${addr}`, revision ? { revision } : {})
    }
    public getCode(addr: string, revision ?: string) {
        return this.httpGet<Connex.Thor.Code>(`accounts/${addr}/code`, revision ? { revision } : {})
    }
    public getStorage(addr: string, key: string, revision ?: string) {
        return this.httpGet<Connex.Thor.Storage>(`accounts/${addr}/storage/${key}`, revision ? { revision } : {})
    }

    public filterEventLogs(arg: Connex.Driver.FilterEventLogsArg) {
        return this.httpPost<Connex.Thor.Event[]>('logs/event', arg)
    }

    public explain(arg: Connex.Driver.ExplainArg, revision: string) {
        return this.httpPost<Connex.Thor.VMOutput[]>('accounts/*', arg, { revision })
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
