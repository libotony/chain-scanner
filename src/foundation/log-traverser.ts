import { Thor } from '../thor-rest'
import { prototype, PrototypeAddress } from '../const'
import { abi } from 'thor-devkit'

export interface LogItem<T extends 'transfer' | 'event'> {
    type: T
    data: T extends 'transfer' ? Thor.Transfer : Thor.Event
}

export const newIterator = function* (tracer: Thor.CallTracerOutput, events: Thor.Event[], transfers: Thor.Transfer[]) {
    let event = 0
    let transfer = 0

    const traverse = function* (t: Thor.CallTracerOutput): Generator<LogItem<'transfer' | 'event'>> {
        if (events.length === event && transfers.length === transfer) {
            return
        }
        let contract: string
        if (['CREATE', 'CREATE2'].indexOf(t.type) !== -1) {
            if (t.value !== '0x0') {
                const tr = transfers[transfer]
                if (tr.sender !== t.from || tr.recipient !== t.to || tr.amount !== t.value) {
                    throw new Error('CREATE(2): transfer log mismatch')
                }
                yield {
                    type: 'transfer',
                    data: transfers[transfer++]
                }
            }
            contract = t.to
            const ev = events[event]
            if (ev.address !== t.to || ev.topics[0] !== prototype.$Master.signature) {
                throw new Error('CREATE(2): failed to find $Master event, recipient address or signature mismatch')
            }

            const decoded = prototype.$Master.decode(ev.data, ev.topics)
            if (decoded.newMaster !== t.from) {
                throw new Error('CREATE(2): failed to find $Master event, newMaster mismatch')
            }
            yield {
                type: 'event',
                data: events[event++]
            }
            for (; event < events.length;) {
                if (events[event].address !== contract) {
                    break
                }
                yield {
                    type: 'event',
                    data: events[event++]
                }
            }
        } else if (['CALL', 'CALLCODE', 'DELEGATECALL'].indexOf(t.type) !== -1) {
            if (t.type === 'CALL') {
                if (t.value !== '0x0') {
                    const tr = transfers[transfer]
                    if (tr.sender !== t.from || tr.recipient !== t.to || tr.amount !== t.value) {
                        throw new Error('Call:transfer log mismatch')
                    }
                    yield {
                        type: 'transfer',
                        data: transfers[transfer++]
                    }
                }
                contract = t.to
                if (contract === PrototypeAddress) {
                    // 0x + 4byte selector + 1 word
                    if (t.input && t.input.length >= (1 + 4 + 32) * 2) {
                        const self = abi.decodeParameter('address', '0x' + t.input.slice(10))
                        if (self) {
                            contract = self
                        }
                    }
                }
            } else {
                contract = t.from
            }
            for (; event < events.length;) {
                if (events[event].address !== contract) {
                    break
                }
                yield {
                    type: 'event',
                    data: events[event++]
                }
            }
        } else if (t.type === 'STATICCALL') {
            // static call does not modify state(emit events,transfer values, write to storage), just skip
            return
        } else {
            throw new Error('unknown: ' + t.type)
        }

        if (t.calls) {
            for (const call of t.calls) {
                // dive into child calls then came back to parent context
                yield* traverse(call)
                for (; event < events.length;) {
                    if (events[event].address !== contract) {
                        break
                    }
                    yield {
                        type: 'event',
                        data: events[event++]
                    }
                }
            }
            for (; event < events.length;) {
                if (events[event].address !== contract) {
                    break
                }
                yield {
                    type: 'event',
                    data: events[event++]
                }
            }
        }
    }

    yield* traverse(tracer)

    if (events.length !== event || transfers.length !== transfer) {
        throw new Error('traverse index mismatch')
    }
}
