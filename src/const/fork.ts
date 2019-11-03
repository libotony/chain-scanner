
export interface ForkConfig {
    VIP191: number
}

export const getForkConfig = (net: string) => {
    if (net === '0x00000000851caf3cfdb6e899cf5958bfb1ac3413d346d43539627e6be7ec1b4a') {
        return {
            VIP191: 3337300
        }
    } else if (net === '0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127') {
        return {
            VIP191: 2898800
        }
    } else {
        throw new Error('unknown network: ' + net)
    }
}
