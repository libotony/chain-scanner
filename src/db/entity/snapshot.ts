import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm'
import { SnapType } from '../../types'
import { simpleJSON, fixedBytes } from '../transformers'

@Entity()
export class Snapshot {
    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column()
    public type: SnapType

    @Column({ type: 'binary', length: 32, transformer: fixedBytes(32, 'snapshot.blockID') })
    @Index()
    public blockID: string

    @Column({ type: 'longtext', transformer: simpleJSON<object>('snapshot.data')})
    public data: object
}
