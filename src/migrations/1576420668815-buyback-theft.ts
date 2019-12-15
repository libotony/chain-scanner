import {MigrationInterface, QueryRunner} from 'typeorm'

export class buybackTheft1576420668815 implements MigrationInterface {
    public name = 'buybackTheft1576420668815'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('CREATE TABLE `buyback_theft` (`address` binary(20) NOT NULL, UNIQUE INDEX `REL_8a0c9556ce5dcf65a308b27615` (`address`), PRIMARY KEY (`address`)) ENGINE=InnoDB', undefined)
        await queryRunner.query('ALTER TABLE `account` ADD `firstSeen` int UNSIGNED NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `account` ADD `alias` varchar(255) NULL', undefined)
        await queryRunner.query('ALTER TABLE `buyback_theft` ADD CONSTRAINT `FK_8a0c9556ce5dcf65a308b27615b` FOREIGN KEY (`address`) REFERENCES `account`(`address`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `buyback_theft` DROP FOREIGN KEY `FK_8a0c9556ce5dcf65a308b27615b`', undefined)
        await queryRunner.query('ALTER TABLE `account` DROP COLUMN `alias`', undefined)
        await queryRunner.query('ALTER TABLE `account` DROP COLUMN `firstSeen`', undefined)
        await queryRunner.query('DROP INDEX `REL_8a0c9556ce5dcf65a308b27615` ON `buyback_theft`', undefined)
        await queryRunner.query('DROP TABLE `buyback_theft`', undefined)
    }

}
