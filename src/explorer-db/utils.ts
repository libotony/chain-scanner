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
