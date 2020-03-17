import {MigrationInterface, QueryRunner} from 'typeorm'

export class authEventAndGas1584414888715 implements MigrationInterface {
    public name = 'authEventAndGas1584414888715'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('CREATE TABLE `authority_event` (`id` int NOT NULL AUTO_INCREMENT, `address` binary(20) NOT NULL, `blockID` binary(32) NOT NULL, `event` int NOT NULL, INDEX `IDX_af10bbc6a81864072a911fd25b` (`address`), PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('ALTER TABLE `block` ADD `gasChanged` int NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `authority` ADD `active` tinyint NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `authority` ADD `endorsed` tinyint NOT NULL', undefined)
        await queryRunner.query('DROP TABLE `gas_adjustment`', undefined)
        await queryRunner.query('ALTER TABLE `authority_event` ADD CONSTRAINT `FK_d761c6f2dcce49ecd6ca0b6eff4` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `authority_event` DROP FOREIGN KEY `FK_d761c6f2dcce49ecd6ca0b6eff4`', undefined)
        await queryRunner.query('ALTER TABLE `authority` DROP COLUMN `endorsed`', undefined)
        await queryRunner.query('ALTER TABLE `authority` DROP COLUMN `active`', undefined)
        await queryRunner.query('ALTER TABLE `block` DROP COLUMN `gasChanged`', undefined)
        await queryRunner.query('DROP INDEX `IDX_af10bbc6a81864072a911fd25b` ON `authority_event`', undefined)
        await queryRunner.query('DROP TABLE `authority_event`', undefined)
    }

}
