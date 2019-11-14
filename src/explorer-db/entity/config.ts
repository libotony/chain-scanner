import { Entity, PrimaryColumn, Column } from 'typeorm'

@Entity()
export class Config {

    @PrimaryColumn({unique: true})
    public key: string

    @Column()
    public value: string

}
