import { Column, Entity, JoinColumn, PrimaryColumn, ManyToOne, Index, PrimaryGeneratedColumn } from 'typeorm'
import { Output } from '../../types'
import { fixedBytes, simpleJSON } from '../transformers'

@Entity()
@Index('receiptUnique', ['txID', 'blockID'], { unique: true })
export class Receipt {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'receipt.txID') })
    public txID: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'transaction.blockID') })
    @Index()
    public blockID: string

    @Column()
    public txIndex: number

    @Column({unsigned: true, type: 'bigint'})
    public gasUsed: number

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'receipt.gasPayer') })
    public gasPayer: string

    @Column()
    public paid: string

    @Column()
    public reward: string

    @Column({ type: 'boolean' })
    public reverted: boolean

    @Column({ type: 'longtext', transformer: simpleJSON<Output[]>('receipt.outputs')})
    public outputs: Output[]
}
