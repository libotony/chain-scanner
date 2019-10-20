import { Column, Entity, JoinColumn, PrimaryColumn, ManyToOne } from 'typeorm'
import { Output } from '../../types'
import { Block } from './block'

@Entity()
export class Receipt {
    @PrimaryColumn({ type: 'char', length: 66 })
    public txID: string

    @ManyToOne(type => Block, {primary: true})
    @JoinColumn({ name: 'blockID' })
    public block: Block

    @Column()
    public txIndex: number

    @Column({unsigned: true, type: 'bigint'})
    public gasUsed: number

    @Column({ type: 'char', length: 42 })
    public gasPayer: string

    @Column()
    public paid: string

    @Column()
    public reward: string

    @Column({ type: 'boolean' })
    public reverted: boolean

    @Column('simple-json')
    public outputs: Output[]
}
