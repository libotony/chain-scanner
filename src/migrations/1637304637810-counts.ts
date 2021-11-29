import {MigrationInterface, QueryRunner} from "typeorm";

export class counts1637304637810 implements MigrationInterface {
    name = 'counts1637304637810'

    public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("CREATE TABLE `counts` (`address` binary(21) NOT NULL, `type` int NOT NULL, `in` int UNSIGNED NOT NULL, `out` int UNSIGNED NOT NULL, `self` int UNSIGNED NOT NULL, PRIMARY KEY (`address`, `type`)) ENGINE=InnoDB", undefined);
    }

    public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query("DROP TABLE `counts`", undefined);
    }

}
