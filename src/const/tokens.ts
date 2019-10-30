import { TokenBasic } from '../types'

const main = new Map<string, TokenBasic>()
const test = new Map<string, TokenBasic>()

const oce = { symbol: 'OCE', address: '', name: 'OceanEx', decimals: 18}

main.set(oce.symbol, {...oce, address: '0x0ce6661b4ba86a0ea7ca2bd86a0de87b0b860f14'} )
test.set(oce.symbol, {...oce, address: '0x9652aead889e8df7b5717ed984f147c132f85a69'} )

export const getVIP180Token = (net: string, symbol: string) => {
    if (net === '0x00000000851caf3cfdb6e899cf5958bfb1ac3413d346d43539627e6be7ec1b4a') {
        if (main.has(symbol)) {
            return main.get(symbol)
        } else {
            throw new Error('unknown token ' + symbol)
        }
    } else if (net === '0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127') {
        if (test.has(symbol)) {
            return test.get(symbol)
        } else {
            throw new Error('unknown token ' + symbol)
        }
    } else {
        throw new Error('unknown network: ' + net)
    }
}
