/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ReversiService } from '@/core/ReversiService.js';

describe('ReversiService.matchSpecificUserCancel', () => {
	function createService(invitations: string[]) {
		const zrange = vi.fn().mockResolvedValue(invitations);
		const zrem = vi.fn().mockResolvedValue(1);
		const redis = { zrange, zrem };
		const loggerService = {
			getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
		};
		const service = new ReversiService(
			{} as any,
			redis as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			loggerService as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
		);
		return { service, zrange, zrem };
	}

	test('保存されている member 形式のまま一致する招待を zrem する', async () => {
		const invitation = JSON.stringify({
			from_user_id: 'user-1',
			game_session_id: 'session-1',
			host_user_id: 'target-1',
		});
		const { service, zrem } = createService([invitation]);

		await service.matchSpecificUserCancel(
			{ id: 'user-1' } as any,
			{ id: 'target-1' } as any,
			'session-1',
		);

		expect(zrem).toHaveBeenCalledWith('reversi:matchSpecific:target-1', invitation);
	});

	test('session ID 未指定なら同じユーザーからの招待をすべて削除する', async () => {
		const first = JSON.stringify({ from_user_id: 'user-1', game_session_id: 'session-1', host_user_id: 'target-1' });
		const second = JSON.stringify({ from_user_id: 'user-1', game_session_id: 'session-2', host_user_id: 'target-1' });
		const other = JSON.stringify({ from_user_id: 'user-2', game_session_id: 'session-3', host_user_id: 'target-1' });
		const { service, zrem } = createService([first, second, other]);

		await service.matchSpecificUserCancel(
			{ id: 'user-1' } as any,
			{ id: 'target-1' } as any,
		);

		expect(zrem).toHaveBeenCalledWith('reversi:matchSpecific:target-1', first, second);
	});

	test('不正な JSON は無視する', async () => {
		const { service, zrem } = createService(['not json']);

		await service.matchSpecificUserCancel(
			{ id: 'user-1' } as any,
			{ id: 'target-1' } as any,
			'session-1',
		);

		expect(zrem).not.toHaveBeenCalled();
	});
});
