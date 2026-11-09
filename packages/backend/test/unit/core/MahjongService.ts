/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import * as Mmj from 'misskey-mahjong';
import { MahjongService, type MahjongRoom } from '@/core/MahjongService.js';
import type { MiUser } from '@/models/User.js';

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

type CallingAnswersForTest = {
	pon: null | boolean;
	cii: null | false | 'x__' | '_x_' | '__x';
	kan: null | boolean;
	ron: Record<Mmj.House, null | boolean>;
};

function createCallingRoom(options: { riichi?: boolean } = {}): MahjongRoom {
	const room = createRoom();
	room.gameState = Mmj.MasterGameEngine.createInitialState({
		riichis: {
			e: false,
			s: options.riichi ?? false,
			w: false,
			n: false,
		},
		handTiles: {
			e: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14],
			// m5 を3枚、m4 と m6 を持たせ、ポン・チー・カンを同時に成立させる
			s: [18, 19, 20, 13, 21, 57, 58, 59, 61, 62, 63, 65, 66],
			w: [22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38],
			n: [39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51],
		},
		hoTiles: {
			e: [17],
			s: [],
			w: [],
			n: [],
		},
		askings: {
			ron: { callee: 'e', callers: ['s', 'w'] },
			pon: { callee: 'e', caller: 's' },
			cii: { callee: 'e', caller: 's' },
			kan: { callee: 'e', caller: 's' },
		},
		tiles: [52, 53, 54, 55, 56, 60, 64, 67, 68, 69, 70],
		kingTiles: [125, 126, 127, 128],
		activatedDorasCount: 1,
		turn: null,
		nextTurnAfterAsking: 's',
	});
	return room;
}

function createCallingService(room: MahjongRoom) {
	const store = new Map<string, string>();
	store.set(`mahjong:room:${room.id}`, JSON.stringify(room));
	store.set(`mahjong:gameCallingAsking:${room.id}`, JSON.stringify({
		pon: null,
		cii: null,
		kan: null,
		ron: { e: null, s: null, w: null, n: null },
	} satisfies CallingAnswersForTest));

	const redisClient = {
		del: vi.fn((key: string) => {
			store.delete(key);
			return Promise.resolve(1);
		}),
		get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
		set: vi.fn((key: string, value: string) => {
			store.set(key, value);
			return Promise.resolve('OK');
		}),
	};

	const service = new MahjongService(
		redisClient as unknown as ConstructorParameters<typeof MahjongService>[0],
		{} as unknown as ConstructorParameters<typeof MahjongService>[1],
		{} as unknown as ConstructorParameters<typeof MahjongService>[2],
		{} as unknown as ConstructorParameters<typeof MahjongService>[3],
	);

	return { service, store };
}

function readCallingAnswers(store: Map<string, string>): CallingAnswersForTest {
	const raw = store.get('mahjong:gameCallingAsking:test-room');
	expect(raw).toBeDefined();
	return JSON.parse(raw!) as CallingAnswersForTest;
}

const user2 = { id: 'user2' } as unknown as MiUser;

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
			const ryuukyoku = published[1]!.payload as {
				tenpaiHouses: Mmj.House[];
				notenHouses: Mmj.House[];
				pointDeltas: Record<Mmj.House, number>;
			};
			expect([...ryuukyoku.tenpaiHouses, ...ryuukyoku.notenHouses].sort()).toEqual(['e', 'n', 's', 'w']);
			expect(ryuukyoku.tenpaiHouses.every(house => !ryuukyoku.notenHouses.includes(house))).toBe(true);
			expect(ryuukyoku.pointDeltas.e + ryuukyoku.pointDeltas.s + ryuukyoku.pointDeltas.w + ryuukyoku.pointDeltas.n).toBe(0);
			expect(room.gameState?.points).toEqual({
				e: 25000 + ryuukyoku.pointDeltas.e,
				s: 25000 + ryuukyoku.pointDeltas.s,
				w: 25000 + ryuukyoku.pointDeltas.w,
				n: 25000 + ryuukyoku.pointDeltas.n,
			});
			expect(room.gameState?.turn).toBeNull();
			// 最後の捨て牌がエンジン状態の河に残っている
			expect(room.gameState?.hoTiles.e.at(-1)).toBe(1);
		} finally {
			service.dispose();
		}
	});

	test('publishes ryuukyoku result when a calling interruption is declined', async () => {
		const room = createRoom();
		const state = createExhaustedState();
		// 最後の捨て牌を済ませた状態で、鳴きの回答待ちから流局する
		state.handTiles.e.pop();
		state.hoTiles.e.push(37);
		state.turn = null;
		state.nextTurnAfterAsking = 's';
		state.askings = {
			ron: null,
			pon: { callee: 'e', caller: 's' },
			cii: null,
			kan: null,
		};
		room.gameState = state;
		const mj = new Mmj.MasterGameEngine(state);

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
			const answers = {
				pon: false,
				cii: false as const,
				kan: false,
				ron: { e: false, s: false, w: false, n: false },
			};
			await (service as unknown as {
				answer: (room: MahjongRoom, mj: Mmj.MasterGameEngine, callingAnswers: typeof answers) => Promise<void>;
			}).answer(room, mj, answers);

			expect(published.map(call => call.type)).toEqual(['ryuukyoku']);
			const ryuukyoku = published[0]!.payload as {
				tenpaiHouses: Mmj.House[];
				notenHouses: Mmj.House[];
				pointDeltas: Record<Mmj.House, number>;
			};
			expect([...ryuukyoku.tenpaiHouses, ...ryuukyoku.notenHouses].sort()).toEqual(['e', 'n', 's', 'w']);
			expect(ryuukyoku.pointDeltas.e + ryuukyoku.pointDeltas.s + ryuukyoku.pointDeltas.w + ryuukyoku.pointDeltas.n).toBe(0);
			expect(room.gameState?.points).toEqual({
				e: 25000 + ryuukyoku.pointDeltas.e,
				s: 25000 + ryuukyoku.pointDeltas.s,
				w: 25000 + ryuukyoku.pointDeltas.w,
				n: 25000 + ryuukyoku.pointDeltas.n,
			});
			expect(room.gameState?.turn).toBeNull();
		} finally {
			service.dispose();
		}
	});

	test('ron declines the same player\'s pon, cii and kan answers', async () => {
		const { service, store } = createCallingService(createCallingRoom());
		try {
			await service.commit_ronHora('test-room', user2);

			const answers = readCallingAnswers(store);
			expect(answers.ron).toEqual({ e: null, s: true, w: null, n: null });
			expect(answers.pon).toBe(false);
			expect(answers.cii).toBe(false);
			expect(answers.kan).toBe(false);
		} finally {
			service.dispose();
		}
	});

	test('pon declines the same player\'s ron, cii and kan answers', async () => {
		const { service, store } = createCallingService(createCallingRoom());
		try {
			await service.commit_pon('test-room', user2);

			const answers = readCallingAnswers(store);
			expect(answers.pon).toBe(true);
			expect(answers.cii).toBe(false);
			expect(answers.kan).toBe(false);
			expect(answers.ron).toEqual({ e: null, s: false, w: null, n: null });
		} finally {
			service.dispose();
		}
	});

	test('cii declines the same player\'s ron, pon and kan answers', async () => {
		const { service, store } = createCallingService(createCallingRoom());
		try {
			await service.commit_cii('test-room', user2, '_x_');

			const answers = readCallingAnswers(store);
			expect(answers.cii).toBe('_x_');
			expect(answers.pon).toBe(false);
			expect(answers.kan).toBe(false);
			expect(answers.ron).toEqual({ e: null, s: false, w: null, n: null });
		} finally {
			service.dispose();
		}
	});

	test('kan declines the same player\'s ron, pon and cii answers', async () => {
		const { service, store } = createCallingService(createCallingRoom());
		try {
			await service.commit_kan('test-room', user2);

			const answers = readCallingAnswers(store);
			expect(answers.kan).toBe(true);
			expect(answers.pon).toBe(false);
			expect(answers.cii).toBe(false);
			expect(answers.ron).toEqual({ e: null, s: false, w: null, n: null });
		} finally {
			service.dispose();
		}
	});

	test('riichi player\'s illegal pon does not decline their ron answer', async () => {
		const { service, store } = createCallingService(createCallingRoom({ riichi: true }));
		try {
			await service.commit_pon('test-room', user2);

			const answers = readCallingAnswers(store);
			expect(answers.pon).toBe(false);
			expect(answers.cii).toBeNull();
			expect(answers.kan).toBeNull();
			expect(answers.ron).toEqual({ e: null, s: null, w: null, n: null });
		} finally {
			service.dispose();
		}
	});

	test('invalid cii does not decline the same player\'s ron answer', async () => {
		const { service, store } = createCallingService(createCallingRoom());
		try {
			// s の手牌では m5 に対して m6, m7 が揃わないため x__ は成立しない
			await service.commit_cii('test-room', user2, 'x__');

			const answers = readCallingAnswers(store);
			expect(answers.cii).toBe(false);
			expect(answers.pon).toBeNull();
			expect(answers.kan).toBeNull();
			expect(answers.ron).toEqual({ e: null, s: null, w: null, n: null });
		} finally {
			service.dispose();
		}
	});
});

describe('MahjongService nextKyokuLocked abortive draw', () => {
	test('aborts on kyushu-kyuhai in the new deal', async () => {
		const room = createRoom();
		room.gameState = Mmj.MasterGameEngine.createInitialState();
		// 新局生成を九種九牌の配牌に差し替える
		const kyushuState = Mmj.MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 33, 37, 69, 73, 105, 109, 113, 117, 121, 125, 129, 133, 5],
				s: [],
				w: [],
				n: [],
			},
		});

		const published: Array<{ type: string; payload: unknown }> = [];
		const globalEventService = {
			publishMahjongRoomStream: (_roomId: string, type: string, payload: unknown) => {
				published.push({ type, payload });
			},
		};
		const store = new Map<string, string>();
		const redisClient = {
			del: vi.fn((key: string) => {
				store.delete(key);
				return Promise.resolve(1);
			}),
			get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
			set: vi.fn((key: string, value: string) => {
				store.set(key, value);
				return Promise.resolve('OK');
			}),
		};

		const service = new MahjongService(
			redisClient as unknown as ConstructorParameters<typeof MahjongService>[0],
			{} as unknown as ConstructorParameters<typeof MahjongService>[1],
			globalEventService as unknown as ConstructorParameters<typeof MahjongService>[2],
			{} as unknown as ConstructorParameters<typeof MahjongService>[3],
		);

		const createInitialState = vi.spyOn(Mmj.MasterGameEngine, 'createInitialState').mockReturnValue(kyushuState);
		try {
			const mj = new Mmj.MasterGameEngine(room.gameState!);
			await (service as unknown as {
				nextKyokuLocked: (room: MahjongRoom, mj: Mmj.MasterGameEngine, kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] }, expected: { round: Mmj.MasterState['round']; kyoku: number; turnCount: number }) => Promise<void>;
			}).nextKyokuLocked(room, mj, { agariHouse: 's', tenpaiHouses: [] }, { round: 'e', kyoku: 1, turnCount: 0 });

			// nextKyoku を publish せず中斷フローに入る
			expect(published.map(call => call.type)).toEqual(['ryuukyoku']);
			const ryuukyoku = published[0]!.payload as { abortive?: string };
			expect(ryuukyoku.abortive).toBe('kyushukyuhai');
			expect(room.gameState?.honba).toBe(1);
			// 次局待機が始まり、局が停止しない
			expect(store.has('mahjong:gameNextKyokuConfirmation:test-room')).toBe(true);
		} finally {
			createInitialState.mockRestore();
			service.dispose();
		}
	});
});
