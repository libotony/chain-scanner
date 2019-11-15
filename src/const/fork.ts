import { Network } from './network'

export interface ForkConfig {
    VIP191: number
}

export const getForkConfig = (net: Network) => {
    if (net === Network.MainNet) {
        return {
            VIP191: 3337300
        }
    } else if (net === Network.TestNet) {
        return {
            VIP191: 2898800
        }
    } else {
        throw new Error('unknown network: ' + net)
    }
}
