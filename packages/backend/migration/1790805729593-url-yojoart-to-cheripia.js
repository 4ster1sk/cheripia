/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UrlYojoartToCheripia1790805729593 {
    name = 'UrlYojoartToCheripia1790805729593'

    async up(queryRunner) {
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/cheripia-dev/cheripia' WHERE "repositoryUrl" = 'https://github.com/yojo-art/cherrypick'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/cheripia-dev/cheripia/issues/new' WHERE "feedbackUrl" IN ('https://github.com/yojo-art/cherrypick', 'https://github.com/yojo-art/cherrypick/issues/new')`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/cheripia-dev/cheripia'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/cheripia-dev/cheripia/issues/new'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/yojo-art/cherrypick/issues/new'`);
        await queryRunner.query(`ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/yojo-art/cherrypick'`);
        await queryRunner.query(`UPDATE "meta" SET "feedbackUrl" = 'https://github.com/yojo-art/cherrypick/issues/new' WHERE "feedbackUrl" = 'https://github.com/cheripia-dev/cheripia/issues/new'`);
        await queryRunner.query(`UPDATE "meta" SET "repositoryUrl" = 'https://github.com/yojo-art/cherrypick' WHERE "repositoryUrl" = 'https://github.com/cheripia-dev/cheripia'`);
    }
}
