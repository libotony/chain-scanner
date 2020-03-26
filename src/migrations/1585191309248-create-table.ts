// tslint:disable:max-line-length
import { MigrationInterface, QueryRunner } from 'typeorm'

export class createTable1585191309248 implements MigrationInterface {
    public name = 'createTable1585191309248'

    public async up(queryRunner: QueryRunner): Promise<any> {
        const dbVal = await queryRunner.query('show global variables like "innodb_file_format"')
        if (dbVal[0].Value !== 'Barracuda') {
            throw new Error('[SET GLOBAL innodb_file_format=Barracuda] REQUIRED')
        }
        await queryRunner.query('CREATE TABLE `account` (`address` binary(20) NOT NULL, `balance` binary(24) NOT NULL, `energy` binary(24) NOT NULL, `blockTime` int UNSIGNED NOT NULL, `firstSeen` int UNSIGNED NOT NULL, `code` blob NULL, `master` binary(20) NULL, `sponsor` binary(20) NULL, `alias` varchar(255) NULL, PRIMARY KEY (`address`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `block` (`id` binary(32) NOT NULL, `number` int NOT NULL, `timestamp` int UNSIGNED NOT NULL, `gasLimit` int UNSIGNED NOT NULL, `gasUsed` int UNSIGNED NOT NULL, `totalScore` int UNSIGNED NOT NULL, `parentID` binary(32) NOT NULL, `txsRoot` binary(32) NOT NULL, `stateRoot` binary(32) NOT NULL, `receiptsRoot` binary(32) NOT NULL, `signer` binary(20) NOT NULL, `beneficiary` binary(20) NOT NULL, `isTrunk` tinyint NOT NULL, `txCount` int NOT NULL, `txsFeatures` int NOT NULL, `score` int NOT NULL, `reward` binary(24) NOT NULL, `gasChanged` int NOT NULL, `size` int NOT NULL, INDEX `IDX_38414873c187a3e0c7943bc4c7` (`number`), INDEX `IDX_ef17653ad52ae011d51e95f42a` (`signer`), PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `asset_movement` (`id` int NOT NULL AUTO_INCREMENT, `sender` binary(20) NOT NULL, `recipient` binary(20) NOT NULL, `amount` binary(24) NOT NULL, `blockID` binary(32) NOT NULL, `txID` binary(32) NOT NULL, `asset` int NOT NULL, `moveIndex` binary(6) NOT NULL, INDEX `IDX_115b6d5e400619c4e13ad78c85` (`txID`), INDEX `IDX_5957e24f93574f30932d2e8878` (`blockID`, `moveIndex`), PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `aggregated_movement` (`id` int NOT NULL AUTO_INCREMENT, `participant` binary(20) NOT NULL, `asset` int NOT NULL, `movementID` int NOT NULL, `seq` binary(10) NOT NULL, `type` int NOT NULL, INDEX `IDX_feb5dc6345d405612ccb22ce33` (`participant`, `asset`, `seq`), INDEX `IDX_671676864e1bae3fea46d33996` (`participant`, `seq`), PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `transaction` (`txID` binary(32) NOT NULL, `chainTag` binary(1) NOT NULL, `blockRef` binary(8) NOT NULL, `expiration` int UNSIGNED NOT NULL, `gasPriceCoef` int UNSIGNED NOT NULL, `gas` int UNSIGNED NOT NULL, `nonce` binary(8) NOT NULL, `dependsOn` binary(32) NULL, `origin` binary(20) NOT NULL, `delegator` binary(20) NULL, `clauses` longtext NOT NULL, `clauseCount` int NOT NULL, `size` int NOT NULL, `gasUsed` int UNSIGNED NOT NULL, `gasPayer` binary(20) NOT NULL, `paid` binary(24) NOT NULL, `reward` binary(24) NOT NULL, `reverted` tinyint NOT NULL, `outputs` longtext NOT NULL, UNIQUE INDEX `REL_3ed5fad44ac5d6c0cb4fe013f4` (`txID`), PRIMARY KEY (`txID`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `transaction_meta` (`txID` binary(32) NOT NULL, `blockID` binary(32) NOT NULL, `seq` binary(10) NOT NULL, INDEX `IDX_07e1d551fb87f7794cc4211f38` (`seq`), PRIMARY KEY (`txID`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `aggregated_transaction` (`id` int NOT NULL AUTO_INCREMENT, `participant` binary(20) NULL, `type` int NOT NULL, `seq` binary(10) NOT NULL, `blockID` binary(32) NOT NULL, `txID` binary(32) NOT NULL, INDEX `IDX_e75cc56a690061209b8c62f72b` (`participant`, `type`, `seq`), INDEX `IDX_86f0e1b6664122a0c980721640` (`participant`, `seq`), PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `authority_event` (`id` int NOT NULL AUTO_INCREMENT, `address` binary(20) NOT NULL, `blockID` binary(32) NOT NULL, `event` int NOT NULL, INDEX `IDX_af10bbc6a81864072a911fd25b` (`address`), PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `authority` (`id` int NOT NULL AUTO_INCREMENT, `address` binary(20) NOT NULL, `endorsor` binary(20) NOT NULL, `identity` binary(32) NOT NULL, `listed` tinyint NOT NULL, `active` tinyint NOT NULL, `endorsed` tinyint NOT NULL, `reward` binary(24) NOT NULL, `signed` int NOT NULL, UNIQUE INDEX `IDX_51f4fb91bcecf2b9a2d00a50a7` (`address`), PRIMARY KEY (`id`, `identity`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `branch_transaction` (`id` int NOT NULL AUTO_INCREMENT, `txID` binary(32) NOT NULL, `blockID` binary(32) NOT NULL, `seq` binary(10) NOT NULL, `chainTag` binary(1) NOT NULL, `blockRef` binary(8) NOT NULL, `expiration` int UNSIGNED NOT NULL, `gasPriceCoef` int UNSIGNED NOT NULL, `gas` int UNSIGNED NOT NULL, `nonce` binary(8) NOT NULL, `dependsOn` binary(32) NULL, `origin` binary(20) NOT NULL, `delegator` binary(20) NULL, `clauses` longtext NOT NULL, `clauseCount` int NOT NULL, `size` int NOT NULL, `gasUsed` int UNSIGNED NOT NULL, `gasPayer` binary(20) NOT NULL, `paid` binary(24) NOT NULL, `reward` binary(24) NOT NULL, `reverted` tinyint NOT NULL, `outputs` longtext NOT NULL, UNIQUE INDEX `TXUnique` (`blockID`, `txID`), PRIMARY KEY (`id`, `txID`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `config` (`key` varchar(255) NOT NULL, `value` varchar(255) NOT NULL, PRIMARY KEY (`key`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `snapshot` (`id` int NOT NULL AUTO_INCREMENT, `type` int NOT NULL, `blockID` binary(32) NOT NULL, `data` longtext NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('CREATE TABLE `token_balance` (`address` binary(20) NOT NULL, `balance` binary(24) NOT NULL, `type` int NOT NULL, PRIMARY KEY (`address`, `type`)) ENGINE=InnoDB ROW_FORMAT=COMPRESSED', undefined)
        await queryRunner.query('ALTER TABLE `asset_movement` ADD CONSTRAINT `FK_fb95e389c7ba15f88adddaaf831` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `aggregated_movement` ADD CONSTRAINT `FK_65a2147619fb9fdb07f010e0e24` FOREIGN KEY (`movementID`) REFERENCES `asset_movement`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `transaction` ADD CONSTRAINT `FK_3ed5fad44ac5d6c0cb4fe013f46` FOREIGN KEY (`txID`) REFERENCES `transaction_meta`(`txID`) ON DELETE CASCADE ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `transaction_meta` ADD CONSTRAINT `FK_c5398e4012a8d5b629f295ba87b` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `aggregated_transaction` ADD CONSTRAINT `FK_804e4c330f258d38fb3fc274b1b` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `authority_event` ADD CONSTRAINT `FK_d761c6f2dcce49ecd6ca0b6eff4` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `branch_transaction` ADD CONSTRAINT `FK_f8a3bfa01affa808fbdbba8a42e` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `snapshot` ADD CONSTRAINT `FK_ef935caafc0d9e699ef3645d8bf` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `snapshot` DROP FOREIGN KEY `FK_ef935caafc0d9e699ef3645d8bf`', undefined)
        await queryRunner.query('ALTER TABLE `branch_transaction` DROP FOREIGN KEY `FK_f8a3bfa01affa808fbdbba8a42e`', undefined)
        await queryRunner.query('ALTER TABLE `authority_event` DROP FOREIGN KEY `FK_d761c6f2dcce49ecd6ca0b6eff4`', undefined)
        await queryRunner.query('ALTER TABLE `aggregated_transaction` DROP FOREIGN KEY `FK_804e4c330f258d38fb3fc274b1b`', undefined)
        await queryRunner.query('ALTER TABLE `transaction_meta` DROP FOREIGN KEY `FK_c5398e4012a8d5b629f295ba87b`', undefined)
        await queryRunner.query('ALTER TABLE `transaction` DROP FOREIGN KEY `FK_3ed5fad44ac5d6c0cb4fe013f46`', undefined)
        await queryRunner.query('ALTER TABLE `aggregated_movement` DROP FOREIGN KEY `FK_65a2147619fb9fdb07f010e0e24`', undefined)
        await queryRunner.query('ALTER TABLE `asset_movement` DROP FOREIGN KEY `FK_fb95e389c7ba15f88adddaaf831`', undefined)
        await queryRunner.query('DROP TABLE `token_balance`', undefined)
        await queryRunner.query('DROP TABLE `snapshot`', undefined)
        await queryRunner.query('DROP TABLE `config`', undefined)
        await queryRunner.query('DROP INDEX `TXUnique` ON `branch_transaction`', undefined)
        await queryRunner.query('DROP TABLE `branch_transaction`', undefined)
        await queryRunner.query('DROP INDEX `IDX_51f4fb91bcecf2b9a2d00a50a7` ON `authority`', undefined)
        await queryRunner.query('DROP TABLE `authority`', undefined)
        await queryRunner.query('DROP INDEX `IDX_af10bbc6a81864072a911fd25b` ON `authority_event`', undefined)
        await queryRunner.query('DROP TABLE `authority_event`', undefined)
        await queryRunner.query('DROP INDEX `IDX_86f0e1b6664122a0c980721640` ON `aggregated_transaction`', undefined)
        await queryRunner.query('DROP INDEX `IDX_e75cc56a690061209b8c62f72b` ON `aggregated_transaction`', undefined)
        await queryRunner.query('DROP TABLE `aggregated_transaction`', undefined)
        await queryRunner.query('DROP INDEX `IDX_07e1d551fb87f7794cc4211f38` ON `transaction_meta`', undefined)
        await queryRunner.query('DROP TABLE `transaction_meta`', undefined)
        await queryRunner.query('DROP INDEX `REL_3ed5fad44ac5d6c0cb4fe013f4` ON `transaction`', undefined)
        await queryRunner.query('DROP TABLE `transaction`', undefined)
        await queryRunner.query('DROP INDEX `IDX_671676864e1bae3fea46d33996` ON `aggregated_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_feb5dc6345d405612ccb22ce33` ON `aggregated_movement`', undefined)
        await queryRunner.query('DROP TABLE `aggregated_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_5957e24f93574f30932d2e8878` ON `asset_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_115b6d5e400619c4e13ad78c85` ON `asset_movement`', undefined)
        await queryRunner.query('DROP TABLE `asset_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_ef17653ad52ae011d51e95f42a` ON `block`', undefined)
        await queryRunner.query('DROP INDEX `IDX_38414873c187a3e0c7943bc4c7` ON `block`', undefined)
        await queryRunner.query('DROP TABLE `block`', undefined)
        await queryRunner.query('DROP TABLE `account`', undefined)
    }

}
