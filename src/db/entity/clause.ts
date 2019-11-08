import { Entity, Column, Index, PrimaryGeneratedColumn } from 'typeorm'
import { fixedBytes, amount, bytes } from '../transformers'

@Index('clauseUnique', ['clauseIndex', 'txID'], { unique: true })
@Entity()
export class Clause {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'clause.txID') })
    public txID: string

    @Column()
    public clauseIndex: number

    @Column({ type: 'binary', length: 32, nullable: true, transformer: fixedBytes(20, 'clause.to', true) })
    public to: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public value: bigint

    @Column({ type: 'blob', nullable: true, transformer: bytes('clause.data', true) })
    public data: string
}
