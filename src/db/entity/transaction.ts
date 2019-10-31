import { Entity, Column, Index, PrimaryGeneratedColumn } from 'typeorm'

import { fixedBytes, simpleJSON } from '../transformers'
import { Clause } from '../../types'

@Entity()
@Index('txUnique', ['txID', 'blockID'], {unique: true})
export class Transaction {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32 , 'transaction.txID') })
    public txID: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'transaction.blockID') })
    @Index()
    public blockID: string

    @Column()
    public txIndex: number

    @Column({ type: 'int', unsigned: true })
    public chainTag: number

    @Column({ type: 'binary', length: 8, transformer: fixedBytes(8 , 'transaction.blockRef') })
    public blockRef: string

    @Column({ unsigned: true })
    public expiration: number

    @Column({ type: 'int', unsigned: true })
    public gasPriceCoef: number

    @Column({ unsigned: true, type: 'bigint' })
    public gas: number

    @Column()
    public nonce: string

    @Column({ type: 'binary', length: 32, nullable: true, transformer: fixedBytes(32, 'transaction.dependsOn', true) })
    public dependsOn: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'tx.origin') })
    public origin: string

    @Column({ type: 'binary', length: 20, nullable: true, transformer: fixedBytes(20, 'tx.delegator', true) })
    public delegator: string

    @Column()
    public size: number
}
