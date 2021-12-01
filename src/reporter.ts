import { hrtime } from 'process';

export class Reporter {
    private ts: bigint
    private startBlock = -1
    private endBlock = -1

    constructor() {
        this.ts = hrtime.bigint()
    }

    private reset() {
        this.ts = hrtime.bigint()
        this.startBlock = -1
        this.endBlock = -1
    }

    update(blockNum: number) {
        if (this.startBlock == -1) {
            this.startBlock = blockNum
        }

        this.endBlock = blockNum
        return this
    }

    get processed() {
        return this.endBlock - this.startBlock
    }

    log() {
        const elapsed = hrtime.bigint() - this.ts
        
        let time = ''
        if (elapsed > BigInt(1e9)) {
            time = (Number(elapsed)/1e9).toFixed(2) +'s'
        } else {
            time = (Number(elapsed)/1e6).toFixed(2) +'ms'
        }
        const ret = `imported blocks(${this.endBlock - this.startBlock}) at Block(${this.endBlock}), time: ${time}`

        this.reset()
        return ret
    }
}