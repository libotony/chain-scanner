
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm'
import { address, amount, bytes32 } from '../transformers'

@Entity()
export class Energy {

    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 20, transformer: address('energy.sender') })
    public sender: string

    @Column({ type: 'binary', length: 20, transformer: address('energy.recipient') })
    public recipient: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public amount: BigInt

    @Column({ type: 'binary', length: 32, transformer: bytes32('energy.blockID') })
    public blockID: string

    @Column({ type: 'binary', length: 32, transformer: bytes32('energy.txID') })
    public txID: string

    @Column()
    public clauseIndex: number

    @Column()
    public logIndex: number
}
