import {MigrationInterface, QueryRunner} from 'typeorm'

export class branchTx1575969920496 implements MigrationInterface {
    public name = 'branchTX1575969920496'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('DROP INDEX `txUnique` ON `transaction`', undefined)
        await queryRunner.query('DROP INDEX `IDX_3ed5fad44ac5d6c0cb4fe013f4` ON `transaction`', undefined)
        await queryRunner.query('ALTER TABLE `receipt` DROP FOREIGN KEY `FK_fc6da5c08e48760e5c4deedfab6`', undefined)
        await queryRunner.query('DROP INDEX `receiptUnique` ON `receipt`', undefined)
        await queryRunner.query('DROP INDEX `IDX_530a66147f04c7f78938f717db` ON `receipt`', undefined)
        await queryRunner.query('CREATE TABLE `branch_receipt` (`id` int NOT NULL AUTO_INCREMENT, `txID` binary(32) NOT NULL, `blockID` binary(32) NOT NULL, `txIndex` int NOT NULL, `gasUsed` int UNSIGNED NOT NULL, `gasPayer` binary(20) NOT NULL, `paid` binary(24) NOT NULL, `reward` binary(24) NOT NULL, `reverted` tinyint NOT NULL, `outputs` longtext NOT NULL, INDEX `IDX_dc5ac27489df27d1c0b1ab153d` (`txID`), UNIQUE INDEX `branchReceiptUnique` (`blockID`, `txID`), PRIMARY KEY (`id`)) ENGINE=InnoDB', undefined)
        await queryRunner.query('CREATE TABLE `branch_transaction` (`id` int NOT NULL AUTO_INCREMENT, `txID` binary(32) NOT NULL, `blockID` binary(32) NOT NULL, `txIndex` int NOT NULL, `chainTag` binary(1) NOT NULL, `blockRef` binary(8) NOT NULL, `expiration` int UNSIGNED NOT NULL, `gasPriceCoef` int UNSIGNED NOT NULL, `gas` int UNSIGNED NOT NULL, `nonce` binary(8) NOT NULL, `dependsOn` binary(32) NULL, `origin` binary(20) NOT NULL, `delegator` binary(20) NULL, `clauses` longtext NOT NULL, `size` int NOT NULL, INDEX `IDX_d311d6681ac278d1b3788f0a61` (`txID`), UNIQUE INDEX `BranchTXUnique` (`blockID`, `txID`), PRIMARY KEY (`id`)) ENGINE=InnoDB', undefined)
        await queryRunner.query('ALTER TABLE `transaction` CHANGE `id` `id` int NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `transaction` DROP PRIMARY KEY', undefined)
        await queryRunner.query('ALTER TABLE `transaction` DROP COLUMN `id`', undefined)
        await queryRunner.query('ALTER TABLE `receipt` CHANGE `id` `id` int NOT NULL', undefined)
        await queryRunner.query('ALTER TABLE `receipt` DROP PRIMARY KEY', undefined)
        await queryRunner.query('ALTER TABLE `receipt` DROP COLUMN `id`', undefined)
        await queryRunner.query('ALTER TABLE `transaction` ADD PRIMARY KEY (`txID`)', undefined)
        await queryRunner.query('ALTER TABLE `receipt` ADD PRIMARY KEY (`txID`)', undefined)
        await queryRunner.query('ALTER TABLE `receipt` ADD UNIQUE INDEX `IDX_530a66147f04c7f78938f717db` (`txID`)', undefined)
        await queryRunner.query('CREATE UNIQUE INDEX `REL_530a66147f04c7f78938f717db` ON `receipt` (`txID`)', undefined)
        await queryRunner.query('ALTER TABLE `branch_receipt` ADD CONSTRAINT `FK_6c13157efb67f9a9eb81a155f0c` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `branch_transaction` ADD CONSTRAINT `FK_f8a3bfa01affa808fbdbba8a42e` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `receipt` ADD CONSTRAINT `FK_530a66147f04c7f78938f717dbc` FOREIGN KEY (`txID`) REFERENCES `transaction`(`txID`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('ALTER TABLE `receipt` ADD CONSTRAINT `FK_fc6da5c08e48760e5c4deedfab6` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `receipt` DROP FOREIGN KEY `FK_530a66147f04c7f78938f717dbc`', undefined)
        await queryRunner.query('ALTER TABLE `branch_transaction` DROP FOREIGN KEY `FK_f8a3bfa01affa808fbdbba8a42e`', undefined)
        await queryRunner.query('ALTER TABLE `branch_receipt` DROP FOREIGN KEY `FK_6c13157efb67f9a9eb81a155f0c`', undefined)
        await queryRunner.query('DROP INDEX `REL_530a66147f04c7f78938f717db` ON `receipt`', undefined)
        await queryRunner.query('ALTER TABLE `receipt` DROP INDEX `IDX_530a66147f04c7f78938f717db`', undefined)
        await queryRunner.query('ALTER TABLE `receipt` DROP PRIMARY KEY', undefined)
        await queryRunner.query('ALTER TABLE `transaction` DROP PRIMARY KEY', undefined)
        await queryRunner.query('ALTER TABLE `receipt` ADD `id` int NOT NULL AUTO_INCREMENT', undefined)
        await queryRunner.query('ALTER TABLE `receipt` ADD PRIMARY KEY (`id`)', undefined)
        await queryRunner.query('ALTER TABLE `receipt` CHANGE `id` `id` int NOT NULL AUTO_INCREMENT', undefined)
        await queryRunner.query('ALTER TABLE `transaction` ADD `id` int NOT NULL AUTO_INCREMENT', undefined)
        await queryRunner.query('ALTER TABLE `transaction` ADD PRIMARY KEY (`id`)', undefined)
        await queryRunner.query('ALTER TABLE `transaction` CHANGE `id` `id` int NOT NULL AUTO_INCREMENT', undefined)
        await queryRunner.query('DROP INDEX `BranchTXUnique` ON `branch_transaction`', undefined)
        await queryRunner.query('DROP INDEX `IDX_d311d6681ac278d1b3788f0a61` ON `branch_transaction`', undefined)
        await queryRunner.query('DROP TABLE `branch_transaction`', undefined)
        await queryRunner.query('DROP INDEX `branchReceiptUnique` ON `branch_receipt`', undefined)
        await queryRunner.query('DROP INDEX `IDX_dc5ac27489df27d1c0b1ab153d` ON `branch_receipt`', undefined)
        await queryRunner.query('DROP TABLE `branch_receipt`', undefined)
        await queryRunner.query('CREATE INDEX `IDX_530a66147f04c7f78938f717db` ON `receipt` (`txID`)', undefined)
        await queryRunner.query('CREATE UNIQUE INDEX `receiptUnique` ON `receipt` (`blockID`, `txID`)', undefined)
        await queryRunner.query('CREATE INDEX `IDX_3ed5fad44ac5d6c0cb4fe013f4` ON `transaction` (`txID`)', undefined)
        await queryRunner.query('CREATE UNIQUE INDEX `txUnique` ON `transaction` (`blockID`, `txID`)', undefined)
    }

}
