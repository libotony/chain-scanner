
import { Entity, Column, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Block } from './block'
import { bytes32 } from '../transformers'
import { Clause } from '../../types'

@Entity()
@Index('txUnique', ['txID', 'blockID'], {unique: true})
export class Transaction {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 32, transformer: bytes32('transaction.txID') })
    public txID: string

    @Column({ type: 'binary', length: 40, transformer: bytes32('transaction.blockID') })
    public blockID: string

    @Column()
    public txIndex: number

    @Column({ type: 'int', unsigned: true })
    public chainTag: number

    @Column({ type: 'char', length: 18 })
    public blockRef: string

    @Column({ unsigned: true })
    public expiration: number

    @Column({ type: 'int', unsigned: true })
    public gasPriceCoef: number

    @Column({ unsigned: true, type: 'bigint' })
    public gas: number

    @Column()
    public nonce: string

    @Column({ type: 'binary', length: 32, nullable: true, transformer: bytes32('transaction.dependsOn', true) })
    public dependsOn: string

    @Column('simple-json')
    public clauses: Clause[]

    @Column()
    public size: number
}
