import {MigrationInterface, QueryRunner} from 'typeorm'

export class blockTimestamp1586876232855 implements MigrationInterface {
    public name = 'blockTimestamp1586876232855'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('CREATE INDEX `IDX_5c67cbcf4960c1a39e5fe25e87` ON `block` (`timestamp`)', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('DROP INDEX `IDX_5c67cbcf4960c1a39e5fe25e87` ON `block`', undefined)
    }
}
