import { Network } from '../const'
import { getBlockByNumber } from '../service/block'

export const getNetwork = () => {
    let net: Network

    switch (process.argv[2]) {
        case 'main':
            net = Network.MainNet
            break
        case 'test':
            net = Network.TestNet
            break
        case undefined :
            net = Network.MainNet
            break
        default:
            throw new Error('invalid network')
    }
    return net!
}

export const checkNetworkWithDB = async (net: Network) => {
    const gene = (await getBlockByNumber(0))!

    if (gene.id !== net) {
        throw new Error('network mismatch with genesis in db')
    }
}
