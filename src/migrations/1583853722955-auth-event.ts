import {MigrationInterface, QueryRunner} from 'typeorm'

export class authEvent1583853722955 implements MigrationInterface {
    public name = 'authEvent1583853722955'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('CREATE TABLE `authority_event` (`id` int NOT NULL AUTO_INCREMENT, `address` binary(20) NOT NULL, `blockID` binary(32) NOT NULL, `event` int NOT NULL, INDEX `IDX_e9fb5767dcff3c77e2378e8cbb` (`address`), PRIMARY KEY (`id`)) ENGINE=InnoDB  ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('ALTER TABLE `gas_adjustment` DROP COLUMN `prevBlock`', undefined)
        await queryRunner.query('ALTER TABLE `gas_adjustment` DROP COLUMN `gasDiff`', undefined)
        await queryRunner.query('ALTER TABLE `authority` ADD `active` tinyint NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `authority` ADD `endorsed` tinyint NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `gas_adjustment` ADD `gasChanged` int NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `authority_event` ADD CONSTRAINT `FK_ff2b54a670779cf5359e1af3b0b` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `authority_event` DROP FOREIGN KEY `FK_ff2b54a670779cf5359e1af3b0b`', undefined)
        await queryRunner.query('ALTER TABLE `gas_adjustment` DROP COLUMN `gasChanged`', undefined)
        await queryRunner.query('ALTER TABLE `authority` DROP COLUMN `endorsed`', undefined)
        await queryRunner.query('ALTER TABLE `authority` DROP COLUMN `active`', undefined)
        await queryRunner.query('ALTER TABLE `gas_adjustment` ADD `gasDiff` int NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `gas_adjustment` ADD `prevBlock` binary(32) NOT NULL', undefined)
        await queryRunner.query('DROP INDEX `IDX_e9fb5767dcff3c77e2378e8cbb` ON `authority_events`', undefined)
        await queryRunner.query('DROP TABLE `authority_event`', undefined)
    }

}
