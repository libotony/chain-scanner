import { Network } from './network'

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

export type Token = TokenBasic & TokenConfig

const main = new Map<string, Token>()
const test = new Map<string, Token>()

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
const hai = { symbol: 'HAI', address: '', name: 'HackenAI', decimals: 8 }
const mdn = { symbol: 'MDN', address: '', name: 'Madini', decimals: 18 }
const veed = { symbol: 'VEED', address: '', name: 'VIMworld', decimals: 18 }

main.set(pla.symbol, { ...pla, address: '0x89827f7bb951fd8a56f8ef13c5bfee38522f2e1f' })
main.set(sha.symbol, { ...sha, address: '0x5db3c8a942333f6468176a870db36eef120a34dc' })
main.set(ehrt.symbol, {
    ...ehrt, address: '0xf8e1faa0367298b55f57ed17f7a2ff3f5f1d1628',
    burnOnZero: true,
    genesis: { '0x8d8d8a0c77628926908dedaf3fbffce3d416fc2d': '10000000000000000000000000000' }
})
main.set(dbet.symbol, { ...dbet, address: '0x1b8ec6c2a45cca481da6f243df0d7a5744afc1f8', genesis: { '0x1b8ec6c2a45cca481da6f243df0d7a5744afc1f8': '205903294831970956466297922' } })
main.set(tic.symbol, { ...tic, address: '0xa94a33f776073423e163088a5078feac31373990' })
main.set(oce.symbol, { ...oce, address: '0x0ce6661b4ba86a0ea7ca2bd86a0de87b0b860f14' })
main.set(snk.symbol, { ...snk, address: '0x540768b909782c430cc321192e6c2322f77494ec' })
main.set(jur.symbol, { ...jur, address: '0x46209d5e5a49c1d403f4ee3a0a88c3a27e29e58d' })
main.set(aqd.symbol, { ...aqd, address: '0xf9fc8681bec2c9f35d0dd2461d035e62d643659b' })
main.set(yeet.symbol, { ...yeet, address: '0xae4c53b120cba91a44832f875107cbc8fbee185c' })
main.set(hai.symbol, {
    ...hai, address: '0xacc280010b2ee0efc770bce34774376656d8ce14',
    burnOnZero: true
})
main.set(veed.symbol, {
    ...veed, address: '0x67fd63f6068962937ec81ab3ae3bf9871e524fc9',
    burnOnZero: true,
    genesis: { '0x1eb065a93bf325f53abc47c23289946bedec3d72': '100000000000000000000000000000' }
})
main.set(mdn.symbol, { ...mdn, address: '0x1b44a9718e12031530604137f854160759677192' })

test.set(pla.symbol, { ...pla, address: '0x645d2019ed39e58db76af602317d177b53ba8b9d' })
test.set(sha.symbol, { ...sha, address: '0xa1bcfa20a82eca70a5af5420b11bc53a279024ec' })
test.set(ehrt.symbol, {
    ...ehrt, address: '0xdeff1d52f3fbf551b3337b9a02f719cd21da956b',
    burnOnZero: true,
    genesis: { '0xb5d8da87b6a92cc37477048b4bcd7b8070c843a7': '10000000000000000000000000000' }
})
test.set(dbet.symbol, { ...dbet, address: '0x510fcddc9424b1bbb328a574f45bfddb130e1f03', genesis: { '0x510fcddc9424b1bbb328a574f45bfddb130e1f03': '205903294831970956466297922' } })
test.set(oce.symbol, { ...oce, address: '0x9652aead889e8df7b5717ed984f147c132f85a69' })
test.set(jur.symbol, { ...jur, address: '0x602b7a4309b3412d269c6cdddad962c0b94494d8' })
test.set(yeet.symbol, { ...yeet, address: '0x32456c328f647f5b35757d38fe634868d9fe3808' })
test.set(veed.symbol, {
    ...veed, address: '0xa39a4b2e23220305083e2e7c94c8950ef1e641c6',
    burnOnZero: true,
    genesis: { '0x9860a75e0b2746b4ee459483dd095206b761f9a6': '100000000000000000000000000000' }
})
test.set(mdn.symbol, { ...mdn, address: '0x4c76f2c483e0ec292c06d0a0d1440717ed0787c0' })

export const getVIP180Token = (net: Network, symbol: string) => {
    if (net === Network.MainNet) {
        if (main.has(symbol)) {
            return main.get(symbol)!
        } else {
            throw new Error('unknown token ' + symbol)
        }
    } else if (net === Network.TestNet) {
        if (test.has(symbol)) {
            return test.get(symbol)!
        } else {
            throw new Error('unknown token ' + symbol)
        }
    } else {
        throw new Error('unknown network: ' + net)
    }
}
