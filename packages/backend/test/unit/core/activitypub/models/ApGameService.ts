/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ApGameService } from '@/core/activitypub/models/ApGameService.js';

describe('ApGameService', () => {
	function createService() {
		const set = vi.fn();
		const expire = vi.fn();
		const exec = vi.fn().mockResolvedValue([]);
		const redisClient = {
			get: vi.fn().mockResolvedValue(null),
			pipeline: vi.fn().mockReturnValue({ set, expire, exec }),
		};
		const reversiGamesRepository = {
			findOneBy: vi.fn().mockResolvedValue(null),
		};
		const reversiService = {
			isValidReversiUpdateKey: vi.fn().mockReturnValue(true),
			isValidReversiUpdateValue: vi.fn().mockReturnValue(true),
			updateSettings: vi.fn(),
			gameReady: vi.fn(),
			putStoneToGame: vi.fn(),
			get: vi.fn(),
			surrender: vi.fn(),
			cancelGame: vi.fn(),
			sendReaction: vi.fn(),
		};

		const service = new ApGameService(
			{} as any,
			redisClient as any,
			reversiGamesRepository as any,
			{} as any,
			{} as any,
			{} as any,
			{} as any,
			{ logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } } as any,
			reversiService as any,
		);

		return { service, redisClient, reversiGamesRepository, set, expire };
	}

	test('reversiIdFromUUID: 非文字列や空文字は DB / Redis を照会せず null を返す', async () => {
		const { service, redisClient, reversiGamesRepository } = createService();

		expect(await service.reversiIdFromUUID(undefined as any)).toBeNull();
		expect(await service.reversiIdFromUUID(null as any)).toBeNull();
		expect(await service.reversiIdFromUUID('' as any)).toBeNull();
		expect(await service.reversiIdFromUUID({} as any)).toBeNull();

		expect(redisClient.get).not.toHaveBeenCalled();
		expect(reversiGamesRepository.findOneBy).not.toHaveBeenCalled();
	});

	test('reversiIdFromUUID: 正常な文字列 UUID は DB から解決してキャッシュする', async () => {
		const { service, reversiGamesRepository, set } = createService();
		reversiGamesRepository.findOneBy.mockResolvedValue({ id: 'game-123' });

		const id = await service.reversiIdFromUUID('550e8400-e29b-41d4-a716-446655440000');

		expect(id).toBe('game-123');
		expect(reversiGamesRepository.findOneBy).toHaveBeenCalledWith({
			federationId: '550e8400-e29b-41d4-a716-446655440000',
		});
		expect(set).toHaveBeenCalledWith('reversi:federationId:550e8400-e29b-41d4-a716-446655440000', 'game-123');
	});
});
