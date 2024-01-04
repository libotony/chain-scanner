import {MigrationInterface, QueryRunner} from "typeorm";

export class configValueLongtext1704288346811 implements MigrationInterface {
    name = 'configValueLongtext1704288346811'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `config` DROP COLUMN `value`", undefined);
        await queryRunner.query("ALTER TABLE `config` ADD `value` longtext NOT NULL", undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `config` DROP COLUMN `value`", undefined);
        await queryRunner.query("ALTER TABLE `config` ADD `value` varchar(255) NOT NULL", undefined);
    }

}
