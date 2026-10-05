/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// avatarUrl/bannerUrl にメディアプロキシのURLを保存しないようにしたため、既存のレコードを元ファイルのURLに正規化する
export class NormalizeUserAvatarBannerUrl1791076487538 {
    name = 'NormalizeUserAvatarBannerUrl1791076487538'

    /**
     * @param {QueryRunner} queryRunner
     */
    async up(queryRunner) {
        // 既に正規化済みの行は書き換えない
        await queryRunner.query(`UPDATE "user" SET "avatarUrl" = NULLIF(COALESCE("drive_file"."webpublicUrl", "drive_file"."url"), '') FROM "drive_file" WHERE "user"."avatarId" = "drive_file"."id" AND "user"."avatarUrl" IS DISTINCT FROM NULLIF(COALESCE("drive_file"."webpublicUrl", "drive_file"."url"), '')`);
        await queryRunner.query(`UPDATE "user" SET "bannerUrl" = NULLIF(COALESCE("drive_file"."webpublicUrl", "drive_file"."url"), '') FROM "drive_file" WHERE "user"."bannerId" = "drive_file"."id" AND "user"."bannerUrl" IS DISTINCT FROM NULLIF(COALESCE("drive_file"."webpublicUrl", "drive_file"."url"), '')`);
    }

    /**
     * @param {QueryRunner} queryRunner
     */
    async down(queryRunner) {
        // プロキシURLは復元できないため何もしない (APIではpack時にプロキシURLを付与している)
    }
}
