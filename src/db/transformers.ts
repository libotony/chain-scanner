import { sanitizeHex } from '../utils'

// TODO: transformers not work in FindOperators(Bug of typeorm)
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

export const fixedBytes = (len= 32, context: string, nullable = false) =>  {
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
                throw new Error(context + ': bytes' + len + ' hex string required: ' + val)
            }

            const str = sanitizeHex(val).padStart(len * 2, '0')
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

            const str = sanitizeHex(val)
            if (str.length === 0 && nullable) {
                return null
            }

            return Buffer.from(str, 'hex')
        }
    }
}

export const simpleJSON = <T>(context: string) => {
    return {
        from: (val: string) => {
            return JSON.parse(val) as T
        },
        to: (val: T) => {
            return JSON.stringify(val)
        }
    }
}
