import { ValueTransformer } from 'typeorm'

const sanitizeHex = (val: string) => {
    if (val.startsWith('0x')) {
        return val.slice(2)
    } else {
        return val
    }
}

export const address = (context: string, nullable = false) =>  {
    return {
        from: (val: Buffer|null) => {
            if (nullable && val === null) {
                return null
            }
            return '0x' + val.toString('hex')
        },
        to: (val: string|null) => {
            if (nullable && val === null) {
                return null
            }
            if (!/^0x[0-9a-fA-f]+/i.test(val)) {
                throw new Error(context + ': bytes20 hex string required: ' + val)
            }

            const str = sanitizeHex(val).padStart(40, '0')
            return Buffer.from(str, 'hex')
        }
    }
}

export const amount = {
    // 24bytes
    from: (val: Buffer) => {
        return BigInt('0x' + val.toString('hex'))
    },
    to: (val: BigInt) => {

        const str = val.toString(16).padStart(48, '0')
        return Buffer.from(str, 'hex')
    }
}

export const bytes32 = (context: string, nullable = false) =>  {
    return {
        from: (val: Buffer|null) => {
            if (nullable && val === null) {
                return null
            }
            return '0x' + val.toString('hex')
        },
        to: (val: string|null) => {
            if (nullable && val === null) {
                return null
            }
            if (!/^0x[0-9a-fA-f]+/i.test(val)) {
                throw new Error(context + ': bytes32 hex string required: ' + val)
            }

            const str = sanitizeHex(val).padStart(64, '0')
            return Buffer.from(str, 'hex')
        }
    }
}

export const bytes = (context: string, nullable = false) =>  {
    return {
        from: (val: Buffer|null) => {
            if (nullable && val === null) {
                return null
            }
            return '0x' + val.toString('hex')
        },
        to: (val: string|null) => {
            if (nullable && val === null) {
                return null
            }

            if (!/^0x[0-9a-fA-f]+/i.test(val)) {
                throw new Error(context + ': bytes hex string required: ' + val)
            }

            let str = sanitizeHex(val)
            if (str.length % 2) {
                str = '0' + str
            }

            return Buffer.from(str, 'hex')
        }
    }
}
