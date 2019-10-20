import { Entity, Column, PrimaryColumn, Index } from 'typeorm'

@Entity()

@Index(['id', 'isTrunk'])
@Index(['id', 'number'])
export class Block {
    @PrimaryColumn({type: 'char', length: 66})
    public id: string

    @Column({unsigned: true})
    public number: number

    @Column({unsigned: true, type: 'bigint'})
    public timestamp: number

    @Column({unsigned: true, type: 'bigint'})
    public gasLimit: number

    @Column({unsigned: true, type: 'bigint'})
    public gasUsed: number

    @Column({unsigned: true, type: 'bigint'})
    public totalScore: number

    @Column({type: 'char', length: 66})
    public parentID: string

    @Column({ type: 'char', length: 66 })
    public txsRoot: string

    @Column({ type: 'char', length: 66 })
    public stateRoot: string

    @Column({ type: 'char', length: 66 })
    public receiptRoot: string

    @Column({type: 'char', length: 42})
    public signer: string

    @Column({ type: 'char', length: 42 })
    public beneficiary: string

    @Column({type: 'boolean'})
    public isTrunk: boolean

    @Column()
    public txFeatures: number

    @Column()
    public size: number
}
