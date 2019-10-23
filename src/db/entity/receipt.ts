import { Column, Entity, JoinColumn, PrimaryColumn, ManyToOne, Index, PrimaryGeneratedColumn } from 'typeorm'
import { Output } from '../../types'
import { bytes32, address} from '../transformers'

@Entity()
@Index('receiptUnique', ['txID', 'blockID'], { unique: true })
export class Receipt {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 32, transformer: bytes32('receipt.txID') })
    public txID: string

    @Column({ type: 'binary', length: 40, transformer: bytes32('transaction.blockID') })
    public blockID: string

    @Column()
    public txIndex: number

    @Column({unsigned: true, type: 'bigint'})
    public gasUsed: number

    @Column({ type: 'binary', length: 20, transformer: address('receipt.gasPayer') })
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
