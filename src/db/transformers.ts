import { sanitizeHex } from '../utils'
import { FindOperator} from 'typeorm'

interface ValueTransformer<DBType, EntityType> {
    from: (val: DBType) => EntityType,
    to: (val: EntityType|FindOperator<EntityType>) => DBType
}

// transformers not work in FindOperators(issue of typeorm)
const makeTransformer = <DBType, EntityType>(transformer: ValueTransformer<DBType, EntityType>) => {
    return {
        from: transformer.from,
        to: (val: EntityType|FindOperator<EntityType>) => {
            if (val instanceof FindOperator) {
                for (let v of ((val as any)._value as any[])) {
                    v = transformer.to(v)
                }
                return val
            } else {
                return transformer.to(val)
            }
        }
    }
}

export const fixedBytes = (len= 32, context: string, nullable = false) =>  {
    return makeTransformer({
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
    })
}

export const amount = makeTransformer({
    // 24bytes
    from: (val: Buffer) => {
        return BigInt('0x' + val.toString('hex'))
    },
    to: (val: BigInt) => {
        const str = val.toString(16).padStart(48, '0')
        return Buffer.from(str, 'hex')
    }
})

export const bytes = (context: string, nullable = false) =>  {
    return makeTransformer({
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
    })
}

export const simpleJSON = <T>(context: string) => {
    return makeTransformer({
        from: (val: string) => {
            return JSON.parse(val) as T
        },
        to: (val: T) => {
            return JSON.stringify(val)
        }
    })
}
