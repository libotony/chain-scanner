import {MigrationInterface, QueryRunner} from 'typeorm';

export class vmError1604394348651 implements MigrationInterface {
    public name = 'vmError1604394348651'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `transaction` ADD `vmError` text NULL', undefined)
        await queryRunner.query('ALTER TABLE `branch_transaction` ADD `vmError` text NULL', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `branch_transaction` DROP COLUMN `vmError`', undefined)
        await queryRunner.query('ALTER TABLE `transaction` DROP COLUMN `vmError`', undefined)
    }

}
