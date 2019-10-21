
import { Entity, PrimaryColumn, Column, Index, OneToMany, OneToOne, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm'

import { Block } from './block'

@Entity()
@Index('txUnique', ['txID', 'block'], {unique: true})
export class Transaction {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'char', length: 66 })
    public txID: string

    @ManyToOne(type => Block, block => block.id)
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

    @Column()
    public size: number
}
