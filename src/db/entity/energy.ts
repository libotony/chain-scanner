
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm'
import { fixedBytes, amount } from '../transformers'

@Entity()
export class Energy {

    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'energy.sender') })
    public sender: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'energy.recipient') })
    public recipient: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public amount: bigint

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'energy.blockID')})
    public blockID: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'energy.txID') })
    public txID: string

    @Column()
    public clauseIndex: number

    @Column()
    public logIndex: number
}
