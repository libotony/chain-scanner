import { Entity, Column, PrimaryColumn, PrimaryGeneratedColumn, Index } from 'typeorm'
import {fixedBytes, amount} from '../transformers'

@Entity()
export class Authority {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'authority.address') })
    @Index({unique: true})
    public address: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'authority.endorsor') })
    public endorsor: string

    @PrimaryColumn({ type: 'binary', length: 32, transformer: fixedBytes(32, 'authority.identity') })
    public identity: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public reward: bigint

    @Column()
    public listed: boolean

    @Column()
    public signed: number
}
