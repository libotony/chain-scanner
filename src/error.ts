export class InterruptedError extends Error {
    constructor() {
        super('interrupted')
    }
}

export class WaitNextTickError extends Error {
    constructor() {
        super()
    }
}

WaitNextTickError.prototype.name = 'WaitNextTickError'
InterruptedError.prototype.name = 'InterruptedError'
