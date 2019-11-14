export const REVERSIBLE_WINDOW = 12

export const blockIDtoNum = (blockID: string) => {
    if (typeof blockID === 'string' && !/^0x[0-9a-fA-f]{64}$/i.test(blockID)) {
        throw new Error('bytes32 required as param but got: ' + blockID)
    }

    return parseInt(blockID.slice(0, 10), 16)
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

export class InterruptedError extends Error {
    constructor() {
        super('interrupted')
    }
}

InterruptedError.prototype.name = 'InterruptedError'
