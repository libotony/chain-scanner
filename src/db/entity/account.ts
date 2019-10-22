import { Entity, Column, PrimaryColumn, Index } from 'typeorm'

@Entity()
export class Account {
    @PrimaryColumn({ type: 'char', length: 42 })
    public address: string

    @Column()
    public balance: string

    @Column()
    public energy: string

    @Column({ unsigned: true, type: 'bigint' })
    public blockTime: number

    @Column({ type: 'text', nullable: true })
    public code: string

    @Column({ type: 'char', length: 42, nullable: true })
    public master: string
}
