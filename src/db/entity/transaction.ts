
import { Entity, PrimaryColumn, Column, Index, OneToMany, OneToOne, JoinColumn, ManyToOne } from 'typeorm'

import { Clause } from '../../types'
import { Block } from './block'

@Entity()
export class Transaction {
    @PrimaryColumn({ type: 'char', length: 66 })
    public id: string

    @ManyToOne(type => Block, block => block.id, { primary: true })
    @JoinColumn({ name: 'blockID' })
    public block: Block

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

    @Column({ type: 'char', length: 66, nullable: true })
    public dependsOn: string

    @Column('simple-json')
    public clauses: Clause[]

    @Column()
    public size: number
}
