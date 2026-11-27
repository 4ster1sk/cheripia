/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ApGameService } from '@/core/activitypub/models/ApGameService.js';

describe('ApGameService', () => {
	function createService() {
		const set = vi.fn();
		const zadd = vi.fn();
		const expire = vi.fn();
		const exec = vi.fn().mockResolvedValue([]);
		const redisPipeline = { set, zadd, expire, exec };
		const redisClient = {
			get: vi.fn().mockResolvedValue(null),
			pipeline: vi.fn().mockReturnValue(redisPipeline),
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
			federationAvailable: vi.fn().mockResolvedValue(true),
			matchSpecificUserCancel: vi.fn(),
		};
		const userEntityService = {
			pack: vi.fn().mockResolvedValue({}),
		};
		const globalEventService = {
			publishReversiStream: vi.fn(),
		};
		const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

		const service = new ApGameService(
			{} as any,
			redisClient as any,
			reversiGamesRepository as any,
			{} as any,
			userEntityService as any,
			{} as any,
			globalEventService as any,
			{ logger } as any,
			reversiService as any,
		);

		return { service, redisClient, redisPipeline, reversiGamesRepository, reversiService, userEntityService, globalEventService, logger, set, zadd, expire };
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

	describe('reversiInboxJoin / reversiInboxInvite / reversiInboxUndoInvite の game_session_id 検証', () => {
		const localUser = { id: 'local-1' } as any;
		const remoteUser = { id: 'remote-1', host: 'remote.example', channelId: null } as any;

		const malformedGames: Array<[string, any]> = [
			['game_state が欠落', {}],
			['game_state が null', { game_state: null }],
			['game_state が非オブジェクト (文字列)', { game_state: 'invalid' }],
			['game_state が非オブジェクト (数値)', { game_state: 42 }],
			['game_session_id が空文字', { game_state: { game_session_id: '' } }],
			['game_session_id が非文字列', { game_state: { game_session_id: 123 } }],
			['game_session_id が37文字', { game_state: { game_session_id: 'a'.repeat(37) } }],
		];

		for (const [label, game] of malformedGames) {
			test(`reversiInboxJoin: ${label} なら例外を投げず Redis / reversi を触らない`, async () => {
				const { service, redisClient, reversiService, logger } = createService();

				await expect(service.reversiInboxJoin(localUser, remoteUser, game)).resolves.toBeUndefined();
				expect(redisClient.pipeline).not.toHaveBeenCalled();
				expect(reversiService.federationAvailable).not.toHaveBeenCalled();
				expect(logger.warn).toHaveBeenCalled();
			});

			test(`reversiInboxInvite: ${label} なら例外を投げず Redis / reversi を触らない`, async () => {
				const { service, redisClient, globalEventService, logger } = createService();

				await expect(service.reversiInboxInvite(localUser, remoteUser, game)).resolves.toBeUndefined();
				expect(redisClient.pipeline).not.toHaveBeenCalled();
				expect(globalEventService.publishReversiStream).not.toHaveBeenCalled();
				expect(logger.warn).toHaveBeenCalled();
			});

			test(`reversiInboxUndoInvite: ${label} なら例外を投げず reversi を触らない`, async () => {
				const { service, reversiService, logger } = createService();

				await expect(service.reversiInboxUndoInvite(remoteUser, localUser, game)).resolves.toBeUndefined();
				expect(reversiService.matchSpecificUserCancel).not.toHaveBeenCalled();
				expect(logger.warn).toHaveBeenCalled();
			});
		}

		test('reversiInboxJoin: 有効な session ID は Redis に保存する', async () => {
			const { service, redisClient, reversiService, zadd } = createService();

			await service.reversiInboxJoin(localUser, remoteUser, {
				game_state: { game_session_id: 'session-join' },
			} as any);

			expect(reversiService.federationAvailable).toHaveBeenCalledWith('remote.example');
			expect(redisClient.pipeline).toHaveBeenCalled();
			expect(zadd).toHaveBeenCalledWith(
				'reversi:matchSpecific:local-1',
				expect.any(Number),
				expect.stringContaining('"game_session_id":"session-join"'),
			);
		});

		test('reversiInboxInvite: 有効な session ID は Redis に保存し招待を配信する', async () => {
			const { service, zadd, globalEventService } = createService();

			await service.reversiInboxInvite(localUser, remoteUser, {
				game_state: { game_session_id: 'session-invite' },
			} as any);

			expect(zadd).toHaveBeenCalledWith(
				'reversi:matchSpecific:local-1',
				expect.any(Number),
				expect.stringContaining('"game_session_id":"session-invite"'),
			);
			expect(globalEventService.publishReversiStream).toHaveBeenCalledWith('local-1', 'invited', expect.anything());
		});

		test('reversiInboxUndoInvite: 有効な session ID を渡してキャンセルする', async () => {
			const { service, reversiService } = createService();

			await service.reversiInboxUndoInvite(remoteUser, localUser, {
				game_state: { game_session_id: 'session-undo' },
			} as any);

			expect(reversiService.matchSpecificUserCancel).toHaveBeenCalledWith(remoteUser, localUser, 'session-undo');
		});
	});
});
