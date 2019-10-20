
import { Entity, PrimaryColumn, Column, Index, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm'

@Entity()
export class VET {

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

    @Column()
    public snapshot: string
}
