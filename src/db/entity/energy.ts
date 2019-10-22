
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm'

@Entity()
export class Energy {

    @PrimaryGeneratedColumn('increment')
    public id: number

    @Column({ type: 'char', length: 42 })
    public sender: string

    @Column({ type: 'char', length: 42 })
    public recipient: string

    @Column()
    public amount: string

    @Column({ type: 'char', length: 66, nullable: true })
    public blockID: string

    @Column({ type: 'char', length: 66 })
    public txID: string

    @Column()
    public clauseIndex: number

    @Column()
    public logIndex: number
}
