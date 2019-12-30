import {MigrationInterface, QueryRunner} from 'typeorm'

export class aggregatedMove1577675532643 implements MigrationInterface {
    public name = 'aggregatedMove1577675532643'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `asset_movement` DROP FOREIGN KEY `FK_fb95e389c7ba15f88adddaaf831`', undefined)
        await queryRunner.query('DROP INDEX `IDX_f0c1ea99184db6e9753f578b74` ON `asset_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_ab1ca17ac788044b550c269f8e` ON `asset_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_5957e24f93574f30932d2e8878` ON `asset_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_530a66147f04c7f78938f717db` ON `receipt`', undefined)
        await queryRunner.query('ALTER TABLE `asset_movement` ADD CONSTRAINT `FK_fb95e389c7ba15f88adddaaf831` FOREIGN KEY (`blockID`) REFERENCES `block`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION', undefined)
        await queryRunner.query('CREATE TABLE `aggregated_movement` (`id` int NOT NULL AUTO_INCREMENT, `participant` binary(20) NOT NULL, `type` int NOT NULL, `movementID` int NOT NULL, `seq` binary(10) NOT NULL, INDEX `IDX_cb33c052f54daf891b12c1b3eb` (`participant`, `type`, `seq`), INDEX `IDX_671676864e1bae3fea46d33996` (`participant`, `seq`), PRIMARY KEY (`id`)) ENGINE=InnoDB', undefined)
        await queryRunner.query('ALTER TABLE `aggregated_movement` ADD CONSTRAINT `FK_65a2147619fb9fdb07f010e0e24` FOREIGN KEY (`movementID`) REFERENCES `asset_movement`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION', undefined)
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query('ALTER TABLE `aggregated_movement` DROP FOREIGN KEY `FK_65a2147619fb9fdb07f010e0e24`', undefined)
        await queryRunner.query('DROP INDEX `IDX_671676864e1bae3fea46d33996` ON `aggregated_movement`', undefined)
        await queryRunner.query('DROP INDEX `IDX_cb33c052f54daf891b12c1b3eb` ON `aggregated_movement`', undefined)
        await queryRunner.query('DROP TABLE `aggregated_movement`', undefined)
        await queryRunner.query('CREATE UNIQUE INDEX `IDX_530a66147f04c7f78938f717db` ON `receipt` (`txID`)', undefined)
        await queryRunner.query('CREATE INDEX `IDX_5957e24f93574f30932d2e8878` ON `asset_movement` (`blockID`, `moveIndex`)', undefined)
        await queryRunner.query('CREATE INDEX `IDX_ab1ca17ac788044b550c269f8e` ON `asset_movement` (`sender`, `blockID`, `moveIndex`)', undefined)
        await queryRunner.query('CREATE INDEX `IDX_f0c1ea99184db6e9753f578b74` ON `asset_movement` (`recipient`, `blockID`, `moveIndex`)', undefined)
    }

}
