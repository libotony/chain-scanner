import {MigrationInterface, QueryRunner} from 'typeorm'

export class vmError1603779103021 implements MigrationInterface {
    public name = 'vmError1603779103021'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `transaction` ADD `vmError` text NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `branch_transaction` ADD `vmError` text NOT NULL', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `branch_transaction` DROP COLUMN `vmError`', undefined)
        await queryRunner.query('ALTER TABLE `transaction` DROP COLUMN `vmError`', undefined)
    }
}
