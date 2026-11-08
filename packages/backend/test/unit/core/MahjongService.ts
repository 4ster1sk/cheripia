/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import * as Mmj from 'misskey-mahjong';
import { MahjongService, type MahjongRoom } from '@/core/MahjongService.js';

function createRoom(): MahjongRoom {
	return {
		id: 'test-room',
		createdAt: new Date(0).toISOString(),
		startedAt: new Date(0).toISOString(),
		endedAt: null,
		isStarted: true,
		isEnded: false,
		user1Id: 'user1',
		user2Id: 'user2',
		user3Id: 'user3',
		user4Id: 'user4',
		user1: null,
		user2: null,
		user3: null,
		user4: null,
		user1Ai: false,
		user2Ai: false,
		user3Ai: false,
		user4Ai: false,
		user1Ready: true,
		user2Ready: true,
		user3Ready: true,
		user4Ready: true,
		timeLimitForEachTurn: 30,
	};
}

function createExhaustedState(): Mmj.MasterState {
	// 山を空にし、他家が m1 を鳴けない手牌にして、asking なしの流局を作る
	return Mmj.MasterGameEngine.createInitialState({
		tiles: [],
		handTiles: {
			e: [1, 21, 22, 23, 24, 57, 58, 59, 60, 93, 94, 95, 96, 37],
			s: [33, 34, 35, 36, 69, 70, 71, 72, 105, 106, 107, 108, 38],
			w: [29, 30, 31, 32, 65, 66, 67, 68, 101, 102, 103, 104, 42],
			n: [25, 26, 27, 28, 61, 62, 63, 64, 97, 98, 99, 100, 45],
		},
	});
}

describe('MahjongService', () => {
	test('publishes the final discard before ryuukyoku', async () => {
		const room = createRoom();
		const mj = new Mmj.MasterGameEngine(createExhaustedState());

		const published: Array<{ type: string; payload: unknown }> = [];
		const globalEventService = {
			publishMahjongRoomStream: (_roomId: string, type: string, payload: unknown) => {
				published.push({ type, payload });
			},
		};
		const redisClient = {
			del: vi.fn().mockResolvedValue(1),
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue('OK'),
		};

		const service = new MahjongService(
			redisClient as unknown as ConstructorParameters<typeof MahjongService>[0],
			{} as unknown as ConstructorParameters<typeof MahjongService>[1],
			globalEventService as unknown as ConstructorParameters<typeof MahjongService>[2],
			{} as unknown as ConstructorParameters<typeof MahjongService>[3],
		);

		try {
			// m1 を捨てると山が尽きて asking なしの流局になる
			await (service as unknown as {
				dahai: (room: MahjongRoom, mj: Mmj.MasterGameEngine, house: Mmj.House, tile: Mmj.TileId, riichi?: boolean) => Promise<void>;
			}).dahai(room, mj, 'e', 1);

			expect(published.map(call => call.type)).toEqual(['dahai', 'ryuukyoku']);
			expect(published[0]!.payload).toEqual({ house: 'e', tile: 1, riichi: false });
			// 最後の捨て牌がエンジン状態の河に残っている
			expect(room.gameState?.hoTiles.e.at(-1)).toBe(1);
		} finally {
			service.dispose();
		}
	});
});
