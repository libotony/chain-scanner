import { hrtime } from 'process'

export const log = (message: string) => {
    if (!message.endsWith('\n')) {
        message = message + '\n'
    }
    process.stdout.write(message)
}

export const error = (message: string) => {
    if (!message.endsWith('\n')) {
        message = message + '\n'
    }
    process.stderr.write(message)
}

export const task = () => {
    const obj = {
        ts: hrtime.bigint(),
        startBlk: -1,
        endBlk: -1
    }

    return {
        update(blockNum: number) {
            if (obj.startBlk === -1) {
                obj.startBlk = blockNum
            }
            obj.endBlk = blockNum
        },
        processed() {
            return obj.endBlk - obj.startBlk
        },
        elapsed() {
            const ts = hrtime.bigint() - obj.ts
            if (ts > BigInt(1e9)) {
                return (Number(ts)/1e9).toFixed(2) +'s'
            } else {
                return (Number(ts)/1e6).toFixed(2) +'ms'
            }
        },
        reset() {
            obj.startBlk = -1
            obj.endBlk = -1
            obj.ts = hrtime.bigint()
        }
    }
}