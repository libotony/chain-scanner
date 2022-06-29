import {MigrationInterface, QueryRunner} from "typeorm";

export class revertCount1656490709699 implements MigrationInterface {
    name = 'revertCount1656490709699'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `block` ADD `revertCount` int NOT NULL", undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("ALTER TABLE `block` DROP COLUMN `revertCount`", undefined);
    }

}
