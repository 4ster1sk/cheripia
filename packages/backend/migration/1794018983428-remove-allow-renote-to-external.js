/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class RemoveAllowRenoteToExternal1794018983428 {
    name = 'RemoveAllowRenoteToExternal1794018983428'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "allowRenoteToExternal"`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "channel" ADD "allowRenoteToExternal" boolean NOT NULL DEFAULT true`);
    }
}
