import { Network } from './network'

export interface ForkConfig {
    VIP191: number
    ETH_IST: number
}

export const getForkConfig = (net: Network) => {
    if (net === Network.MainNet) {
        return {
            VIP191: 3337300,
            ETH_IST: 9254300
        }
    } else if (net === Network.TestNet) {
        return {
            VIP191: 2898800,
            ETH_IST: 9146700
        }
    } else {
        throw new Error('unknown network: ' + net)
    }
}
