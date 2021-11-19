import {MigrationInterface, QueryRunner} from "typeorm";

export class counts1637304637810 implements MigrationInterface {
    name = 'counts1637304637810'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("CREATE TABLE `counts` (`address` binary(20) NOT NULL, `type` int NOT NULL, `in` int UNSIGNED NOT NULL, `out` int UNSIGNED NOT NULL, `self` int UNSIGNED NOT NULL, INDEX `IDX_6c6d892c6d9460fcd3eb5752d0` (`address`, `type`), PRIMARY KEY (`address`, `type`)) ENGINE=InnoDB", undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("DROP INDEX `IDX_6c6d892c6d9460fcd3eb5752d0` ON `counts`", undefined);
        await queryRunner.query("DROP TABLE `counts`", undefined);
    }

}
