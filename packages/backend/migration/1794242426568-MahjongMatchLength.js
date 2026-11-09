/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 麻雀ルームの対局形式 (`matchLength`: 'east' | 'south') 用カラム。
 *
 * 現在の麻雀ルームは Redis 上の `MahjongRoom` (MahjongService) と
 * `MasterState` (misskey-mahjong) に保持され、対応する DB テーブルは存在しない。
 * そのため本 migration は `mahjong_room` テーブルが存在する場合のみ
 * カラムを追加・削除し、存在しない環境では何もせず正常終了する。
 * 将来ルーム永続化が DB 化された際の受口として残す。
 */
export class MahjongMatchLength1794242426568 {
    name = 'MahjongMatchLength1794242426568';

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        const table = await queryRunner.getTable('mahjong_room');
        if (table == null) return;
        if (table.findColumnByName('matchLength') != null) return;
        await queryRunner.query(`ALTER TABLE "mahjong_room" ADD "matchLength" character varying(8) NOT NULL DEFAULT 'south'`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        const table = await queryRunner.getTable('mahjong_room');
        if (table == null) return;
        if (table.findColumnByName('matchLength') == null) return;
        await queryRunner.query(`ALTER TABLE "mahjong_room" DROP COLUMN "matchLength"`);
    }
}
