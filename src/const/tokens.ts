export interface TokenBasic {
    name: string
    address: string
    symbol: string
    decimals: number,
}

export interface TokenConfig {
    genesis?: {
        [address: string]: string
    },
    // Indicates special cases like EHrT: burn when transfer to zero address
    burnOnZero?: boolean
}

const main = new Map<string, TokenBasic&TokenConfig>()
const test = new Map<string, TokenBasic&TokenConfig>()

const pla = { symbol: 'PLA', address: '', name: 'Plair', decimals: 18 }
const sha = { symbol: 'SHA', address: '', name: 'Safe Haven', decimals: 18 }
const ehrt = { symbol: 'EHrT', address: '', name: 'Eight Hours Token', decimals: 18 }
const dbet = { symbol: 'DBET', address: '', name: 'Decent.bet', decimals: 18 }
const tic = { symbol: 'TIC', address: '', name: 'TicTalk', decimals: 18 }
const oce = { symbol: 'OCE', address: '', name: 'OceanEx', decimals: 18 }
const snk = { symbol: 'SNK', address: '', name: 'SneakerCoin', decimals: 18 }
const jur = { symbol: 'JUR', address: '', name: 'Jur', decimals: 18 }
const aqd = { symbol: 'AQD', address: '', name: 'Aqua Diamond Token', decimals: 18 }
const yeet = { symbol: 'YEET', address: '', name: 'Yeet Coin', decimals: 18 }

main.set(pla.symbol, { ...pla, address: '0x89827f7bb951fd8a56f8ef13c5bfee38522f2e1f' })
main.set(sha.symbol, { ...sha, address: '0x5db3c8a942333f6468176a870db36eef120a34dc' })
main.set(ehrt.symbol, { ...ehrt, address: '0xf8e1faa0367298b55f57ed17f7a2ff3f5f1d1628',
    burnOnZero: true,
    genesis: { '0x8d8d8a0c77628926908dedaf3fbffce3d416fc2d': '10000000000000000000000000000' }
})
main.set(dbet.symbol, { ...dbet, address: '0x1b8ec6c2a45cca481da6f243df0d7a5744afc1f8', genesis: {'0x1b8ec6c2a45cca481da6f243df0d7a5744afc1f8': '205903294831970956466297922'} })
main.set(tic.symbol, { ...tic, address: '0xa94a33f776073423e163088a5078feac31373990' })
main.set(oce.symbol, { ...oce, address: '0x0ce6661b4ba86a0ea7ca2bd86a0de87b0b860f14' })
main.set(snk.symbol, { ...snk, address: '0x540768b909782c430cc321192e6c2322f77494ec' })
main.set(jur.symbol, { ...jur, address: '0x46209d5e5a49c1d403f4ee3a0a88c3a27e29e58d' })
main.set(aqd.symbol, { ...aqd, address: '0xf9fc8681bec2c9f35d0dd2461d035e62d643659b' })
main.set(yeet.symbol, { ...yeet, address: '0xae4c53b120cba91a44832f875107cbc8fbee185c' })

test.set(pla.symbol, { ...pla, address: '0x645d2019ed39e58db76af602317d177b53ba8b9d' })
test.set(sha.symbol, { ...sha, address: '0x9c6e62b3334294d70c8e410941f52d482557955b' })
test.set(ehrt.symbol, { ...ehrt, address: '0xdeff1d52f3fbf551b3337b9a02f719cd21da956b' })
test.set(dbet.symbol, { ...dbet, address: '0x510fcddc9424b1bbb328a574f45bfddb130e1f03' })
test.set(oce.symbol, { ...oce, address: '0x9652aead889e8df7b5717ed984f147c132f85a69' })
test.set(jur.symbol, { ...jur, address: '0x602b7a4309b3412d269c6cdddad962c0b94494d8' })
test.set(yeet.symbol, { ...yeet, address: '0x32456c328f647f5b35757d38fe634868d9fe3808' })

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
