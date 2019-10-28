export const REVERSIBLE_WINDOW = 12

export const blockIDtoNum = (blockID: string) => {
    if (typeof blockID === 'string' && !/^0x[0-9a-fA-f]{64}$/i.test(blockID)) {
        throw new Error('bytes32 required as param but got: ' + blockID)
    }

    return parseInt(blockID.slice(0, 10), 16)
}

export const sanitizeHex = (val: string) => {
    if (val.startsWith('0x')) {
        val = val.slice(2)
    }
    if (val.length % 2) {
        val = '0' + val
    }
    return val
}

export const hexToBuffer = (val: string) => {
    if ( !/^0x[0-9a-fA-f]+/i.test(val)) {
        throw new Error('hex string required as param but got: ' + val)
    }

    return Buffer.from(sanitizeHex(val), 'hex')
}

export const bufferToHex = (val: Buffer) => {
    return '0x' + val.toString('hex')
}

export const sleep = (ms: number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

export const displayID = (blockID: string) => {
    return `${blockIDtoNum(blockID)}...${blockID.slice(58)}`
}
