import { Entity, Column, PrimaryColumn } from 'typeorm'
import {fixedBytes, amount, bytes} from '../transformers'

@Entity()
export class Account {
    @PrimaryColumn({ type: 'binary', length: 20, transformer: fixedBytes(20, 'account.address') })
    public address: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public balance: bigint

    @Column({ type: 'binary', length: 24, transformer: amount })
    public energy: bigint

    @Column({ unsigned: true, type: 'bigint' })
    public blockTime: number

    @Column({ type: 'blob', nullable: true, transformer: bytes('account.code', true) })
    public code: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'account.master', true), nullable: true })
    public master: string
}
