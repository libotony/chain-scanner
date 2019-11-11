import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm'
import {fixedBytes, amount, movementIndex} from '../transformers'
import { AssetType, MovementIndex } from '../../types'

@Index(['blockID', 'moveIndex'])
@Entity()
export class AssetMovement {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'transfer.sender') })
    public sender: string

    @Column({ type: 'binary', length: 20, transformer: fixedBytes(20, 'transfer.recipient') })
    public recipient: string

    @Column({ type: 'binary', length: 24, transformer: amount })
    public amount: bigint

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'transfer.blockID') })
    public blockID: string

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'transfer.txID') })
    public txID: string

    @Column()
    public type: AssetType

    @Column({ type: 'binary', length: 6, transformer: movementIndex })
    public moveIndex: MovementIndex
}
