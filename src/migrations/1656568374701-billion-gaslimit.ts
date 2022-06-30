import {MigrationInterface, QueryRunner} from "typeorm";

export class billionGaslimit1656568374701 implements MigrationInterface {
    name = 'billionGaslimit1656568374701'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `block` DROP COLUMN `gasLimit`", undefined);
        await queryRunner.query("ALTER TABLE `block` ADD `gasLimit` bigint UNSIGNED NOT NULL", undefined);
        await queryRunner.query("ALTER TABLE `block` DROP COLUMN `gasUsed`", undefined);
        await queryRunner.query("ALTER TABLE `block` ADD `gasUsed` bigint UNSIGNED NOT NULL", undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `block` DROP COLUMN `gasUsed`", undefined);
        await queryRunner.query("ALTER TABLE `block` ADD `gasUsed` int(10) UNSIGNED NOT NULL", undefined);
        await queryRunner.query("ALTER TABLE `block` DROP COLUMN `gasLimit`", undefined);
        await queryRunner.query("ALTER TABLE `block` ADD `gasLimit` int(10) UNSIGNED NOT NULL", undefined);
    }

}
