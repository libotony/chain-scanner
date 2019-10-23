import { Entity, Column, PrimaryColumn } from 'typeorm'
import {address, amount, bytes} from '../transformers'

@Entity()
export class Account {
    @PrimaryColumn({ type: 'binary', length: 20, transformer: address('account.address') })
    public address: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public balance: BigInt

    @Column({ type: 'binary', length: 24, transformer: amount })
    public energy: BigInt

    @Column({ unsigned: true, type: 'bigint' })
    public blockTime: number

    @Column({ type: 'blob', nullable: true, transformer: bytes('account.code', true) })
    public code: string

    @Column({ type: 'binary', length: 20, transformer: address('account.master', true), nullable: true })
    public master: string
}
