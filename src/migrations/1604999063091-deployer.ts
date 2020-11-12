import {MigrationInterface, QueryRunner} from 'typeorm'

export class deployer1604999063091 implements MigrationInterface {
    public name = 'deployer1604999063091'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `account` ADD `deployer` binary(20) NULL', undefined)
        await queryRunner.query('ALTER TABLE `account` ADD `suicided` tinyint NOT NULL', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `account` DROP COLUMN `suicided`', undefined)
        await queryRunner.query('ALTER TABLE `account` DROP COLUMN `deployer`', undefined)
    }

}
