import { Network, TransferEvent, ZeroAddress, prototype, totalSupply } from '../const'
import { Net } from '../net'
import { Thor } from '../thor-rest'
import { Token } from '../tokens'
import { promises as fs } from 'fs'
import * as path from 'path'

const ghIO = new Net("https://vechain.github.io")

const list: { [index: string]: { [index: string]: Token } } = {
    [Network.MainNet]: {},
    [Network.TestNet]: {},
}

const networks = {
    main: new Net('https://sync-mainnet.vechain.org'),
    test: new Net('https://sync-testnet.vechain.org')
}

const red = (input: string) => {
    return `\x1b[31m${input}\x1b[0m`
}

const tokenGenesis = async (token: Token, net: Network): Promise<Required<Token>['genesis'] | null> => {
    // wrapped token has different schema, no genesis, skip here
    if (token.symbol === 'VVET') {
        return null
    }
    const thor = new Thor(net === Network.MainNet ? networks.main : networks.test, net)

    let events = await thor.filterEventLogs({
        range: { unit: 'block', from: 0, to: Number.MAX_SAFE_INTEGER },
        options: { offset: 0, limit: 1 },
        criteriaSet: [{ address: token.address, topic0: prototype.$Master.signature }],
        order: 'asc'
    })
    const birthNumber = events[0].meta!.blockNumber

    const ret = await thor.explain({
        clauses: [{
            to: token.address,
            value: '0x0',
            data: totalSupply.encode()
        }]
    }, birthNumber.toString())

    const supply = totalSupply.decode(ret[0].data).supply

    const evCnt = 50
    events = await thor.filterEventLogs({
        range: { unit: 'block', from: birthNumber, to: Number.MAX_SAFE_INTEGER },
        options: { offset: 0, limit: evCnt },
        criteriaSet: [{ address: token.address, topic0: TransferEvent.signature }],
        order: 'asc'
    })
    const decodedEv = events.map(x => {
        return { decoded: TransferEvent.decode(x.data, x.topics), meta: x.meta }
    })
    const genesis: Required<Token>['genesis'] = {}

    // account -> balance
    const accounts = new Map<string, bigint>()
    if (BigInt(supply) !== BigInt(0)) {
        const { _from, _to, _value } = decodedEv[0].decoded
        // if sent from zero address, it will be recognized as 
        if (_from !== ZeroAddress) {
            genesis[_from] = supply
            accounts.set(_from, BigInt(supply))
        }
    }
    // otherwise it's on-demand mint, no genesis

    // run initial transfer check
    for (const ev of decodedEv) {
        const { _from, _to, _value } = ev.decoded

        const from = accounts.get(_from) || BigInt(0)
        const to = accounts.get(_to) || BigInt(0)
        const value = BigInt(_value)

        if (_from !== ZeroAddress) {
            if (from < value) {
                throw new Error('initial transfer check failed')
            }
            accounts.set(_from, from - value)
        }
        accounts.set(_to, to + value)
    }

    return Object.keys(genesis).length ? genesis : null
}

const makeFileContent = (list: object, s1: string[], s2: string[]) => {
    let asset = `export enum AssetType { VET = 0, VTHO, '${s1.join("', '")}'`
    if (s2.length) { 
        asset += `, '${s2[0]}' = 100`
        if (s2.length > 1) {
            const rest = s2.slice(1)
            asset += `, '${rest.join("', '")}'`
        }
    }
    asset += '}'

    let types = `export const AssetList = {'VET':0,'VTHO':1`
    for (let i = 0; i < s1.length; i++) {
        types += `,'${s1[i]}':${i + 2}`
    }

    for (let i = 0; i < s2.length; i++) {
        types += `,'${s2[i]}':${i + 100}`
    }
    types += '}'

    return `/* this file is generated by scripts/load-token */
import { Network } from './const'
${asset}
export interface Token {
    name: string
    address: string
    symbol: string
    decimals: number,
    genesis?: {
        [address: string]: string
    }
}
export const list:{ [index: string]: { [index: string]: Token } } = ${JSON.stringify(list, null, 4)}
export const getToken = (net: Network, symbol: string) => {
    if (!list[net]) {
        throw new Error('unknown network: ' + net)
    }

    if (!list[net][symbol]) {
        throw new Error('unknown token: ' + symbol+ ' @'+ (net === Network.MainNet ? 'MainNet': 'TestNet'))
    }

    return list[net][symbol]
}
${types}
export const updateTime = ${new Date().getTime()}
`
}

void (async () => {
    const mainSymbols: string[] = []
    const testSymbols: string[] = []
    const set = new Set<string>()
    const mainnet = await ghIO.http<Array<Omit<Token, 'genesis'>>>('GET', '/token-registry/main.json')
    for (const item of mainnet) {
        if (item.symbol === 'VTHO' || item.symbol === 'VET') {
            continue
        }

        if (!set.has(item.symbol)) { 
            set.add(item.symbol)
            mainSymbols.push(item.symbol)
        }
        const token: Token = {
            name: item.name,
            symbol: item.symbol,
            address: item.address,
            decimals: item.decimals
        }
        try {
            const genesis = await tokenGenesis(token, Network.MainNet)
            if (genesis) {
                token.genesis = genesis
            }
        } catch (e) {
            console.log(red(`failed to get genesis for ${token.symbol}`))
            console.log(e)
            continue
        }
        
        list[Network.MainNet][token.symbol] = token
    }

    const testnet = await ghIO.http<Array<Omit<Token, 'genesis'>>>('GET', '/token-registry/test.json')
    for (const item of testnet) {
        if (item.symbol === 'VTHO' || item.symbol === 'VET') {
            continue
        }

        if (!set.has(item.symbol)) { 
            set.add(item.symbol)
            testSymbols.push(item.symbol)
        }
        const token: Token = {
            name: item.name,
            symbol: item.symbol,
            address: item.address,
            decimals: item.decimals
        }
        try {
            const genesis = await tokenGenesis(token, Network.TestNet)
            if (genesis) {
                token.genesis = genesis
            }
        } catch (e) {
            console.log(red(`failed to get genesis for ${token.symbol}`))
            console.log(e)
            continue
        }
        
        list[Network.TestNet][token.symbol] = token
    }

    const file = await fs.open(path.join(__dirname, "../tokens.ts"), 'w')
    await file.write(makeFileContent(list, mainSymbols, testSymbols))
    await file.close()
    console.log(red('DOT NOT FORGET TO UPDATE IN MASS!'))
    process.exit(0)
})().catch((e) => {
    console.log(e)
    process.exit(-1)
})