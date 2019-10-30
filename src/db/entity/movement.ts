import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm'
import {fixedBytes, amount} from '../transformers'

export abstract class TransferLog {

    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'transfer.sender') })
    public sender: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'transfer.recipient') })
    public recipient: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public amount: bigint

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'transfer.blockID') })
    public blockID: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'transfer.txID') })
    public txID: string

    @Column()
    public clauseIndex: number

    @Column()
    public logIndex: number
}

@Entity()
export class Transfer extends TransferLog {}

@Entity()
export class Energy extends TransferLog { }

@Entity()
export class OCE extends TransferLog { }
