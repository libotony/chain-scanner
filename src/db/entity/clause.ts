import { Entity, Column, Index, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Transaction } from './transaction'

@Entity()

@Index('clauseUnique', ['clauseIndex', 'transaction'], { unique: true})
export class Clause {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'char', length: 42, nullable: true })
    public to: string

    @Column()
    public value: string

    @Column({ type: 'text' })
    public data: string

    @Column()
    public clauseIndex: number

    @ManyToOne(type => Transaction, tx => tx.txID)
    @JoinColumn({ name: 'txID', referencedColumnName: 'txID' })
    public transaction: Transaction
}
