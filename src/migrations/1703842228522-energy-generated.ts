import {MigrationInterface, QueryRunner} from "typeorm";

export class energyGenerated1703842228522 implements MigrationInterface {
    name = 'energyGenerated1703842228522'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `account` ADD `generated` binary(24) NOT NULL", undefined);
        await queryRunner.query("ALTER TABLE `account` ADD `paid` binary(24) NOT NULL", undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `account` DROP COLUMN `paid`", undefined);
        await queryRunner.query("ALTER TABLE `account` DROP COLUMN `generated`", undefined);
    }

}
