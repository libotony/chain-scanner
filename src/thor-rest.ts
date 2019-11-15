import { SimpleNet } from '@vechain/connex.driver-nodejs'
import '@vechain/connex'
import { Network } from './const'

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
    constructor(readonly net: SimpleNet, readonly genesisID = Network.MainNet) { }

    public getBlock(revision: string | number) {
        return this.httpGet<Required<Connex.Thor.Block>>(`blocks/${revision}`)
    }
    public getTransaction(id: string, head?: string) {
        return this.httpGet<Connex.Thor.Transaction>(`transactions/${id}`, head ? { head } : {})
    }
    public getReceipt(id: string, head?: string) {
        return this.httpGet<Connex.Thor.Receipt>(`transactions/${id}/receipt`, head ? { head } : {})
    }
    public getAccount(addr: string, revision?: string) {
        return this.httpGet<Connex.Thor.Account>(`accounts/${addr}`, revision ? { revision } : {})
    }
    public getCode(addr: string, revision?: string) {
        return this.httpGet<Connex.Thor.Code>(`accounts/${addr}/code`, revision ? { revision } : {})
    }
    public getStorage(addr: string, key: string, revision?: string) {
        return this.httpGet<Connex.Thor.Storage>(`accounts/${addr}/storage/${key}`, revision ? { revision } : {})
    }

    public filterEventLogs(arg: Connex.Driver.FilterEventLogsArg) {
        return this.httpPost<Connex.Thor.Event[]>('logs/event', arg)
    }

    public explain(arg: Connex.Driver.ExplainArg, revision: string) {
        return this.httpPost('accounts/*', arg, { revision })
    }

    public httpPost<T>(path: string, body: object,  query?: Record<string, string>): Promise<T> {
        return this.net.http('POST', path, {
            query,
            body,
            validateResponseHeader: this.headerValidator
        })
    }

    protected httpGet<T>(path: string, query?: Record<string, string>): Promise<T> {
        return this.net.http('GET', path, {
            query,
            validateResponseHeader: this.headerValidator
        })
    }

}
