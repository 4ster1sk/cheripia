/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { api, failedApiCall, randomString, signup } from '../utils.js';

describe('bubble-game/ranking', () => {
	test('scope=following は自分とフォロー中のユーザーの記録だけを返す', async () => {
		const gameMode = randomString();
		const seed = Date.now().toString();
		const me = await signup();
		const followed = await signup();
		const stranger = await signup();

		await api('following/create', { userId: followed.id }, me);

		const records = [
			{ user: me, score: 100 },
			{ user: followed, score: 200 },
			{ user: stranger, score: 300 },
		];
		for (const record of records) {
			const res = await api('bubble-game/register', {
				score: record.score,
				seed,
				logs: [],
				gameMode,
				gameVersion: 1,
			}, record.user);
			expect(res.status).toBe(204);
		}

		const all = await api('bubble-game/ranking', { gameMode });
		expect(all.body.map(r => r.user?.id)).toEqual(expect.arrayContaining(records.map(r => r.user.id)));

		const following = await api('bubble-game/ranking', { gameMode, scope: 'following' }, me);
		const followingUserIds = following.body.map(r => r.user?.id);
		expect(followingUserIds).toEqual(expect.arrayContaining([me.id, followed.id]));
		expect(followingUserIds).not.toContain(stranger.id);

		await failedApiCall({
			endpoint: 'bubble-game/ranking',
			parameters: { gameMode, scope: 'following' },
			user: undefined,
		}, {
			status: 400,
			code: 'SIGNIN_REQUIRED',
			id: 'e2e92334-9e26-41ab-a7b4-1af2c554b1cb',
		});
	});
});
