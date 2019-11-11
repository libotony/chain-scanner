import { Entity, Column, PrimaryColumn, Index } from 'typeorm'
import {fixedBytes, amount} from '../transformers'

@Entity()

@Index(['id', 'isTrunk'])
@Index(['id', 'number'])
export class Block {
    @PrimaryColumn({type: 'binary', length: 32, transformer: fixedBytes(32, 'block.id')})
    public id: string

    @Index()
    @Column()
    public number: number

    @Column({unsigned: true, type: 'bigint'})
    public timestamp: number

    @Column({unsigned: true, type: 'bigint'})
    public gasLimit: number

    @Column({unsigned: true, type: 'bigint'})
    public gasUsed: number

    @Column({unsigned: true, type: 'bigint'})
    public totalScore: number

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'block.parentID') })
    public parentID: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'block.txsRoot') })
    public txsRoot: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'block.stateRoot') })
    public stateRoot: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'block.receiptsRoot') })
    public receiptsRoot: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'block.signer') })
    public signer: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'block.beneficiary') })
    public beneficiary: string

    @Column({type: 'boolean'})
    public isTrunk: boolean

    @Column()
    public txsFeatures: number

    @Column()
    public score: number

    @Column({ type: 'binary', length: 24, transformer: amount })
    public reward: bigint

    @Column()
    public size: number
}
