/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { render, cleanup, fireEvent } from '@testing-library/vue';
import * as Mmj from 'misskey-mahjong';
import RoomGame from '@/pages/mahjong/room.game.vue';

vi.mock('@/i.js', () => ({
	$i: { id: 'u1', policies: { canSearchNotes: true } },
	ensureSignin: () => ({ id: 'u1', policies: { canSearchNotes: true } }),
}));

vi.mock('@/router.js', () => ({
	useRouter: () => ({ push: vi.fn(), pushByPath: vi.fn() }),
}));

vi.mock('@/utility/sound.js', () => ({
	playUrl: vi.fn(),
}));

vi.mock('@/components/global/MkAvatar.vue', () => ({
	default: { template: '<div/>' },
}));

vi.mock('@/components/global/MkA.vue', () => ({
	default: { template: '<a><slot/></a>' },
}));

vi.mock('@/components/MkUserOnlineIndicator.vue', () => ({
	default: { template: '<div/>' },
}));

type StreamHandler = (payload: unknown) => void;

function createConnection() {
	const handlers = new Map<string, Set<StreamHandler>>();
	const send = vi.fn();
	return {
		send,
		on: vi.fn((name: string, handler: StreamHandler) => {
			if (!handlers.has(name)) handlers.set(name, new Set());
			handlers.get(name)!.add(handler);
		}),
		off: vi.fn(),
		emit(name: string, payload: unknown) {
			for (const handler of handlers.get(name) ?? []) handler(payload);
		},
	};
}

function createPlayerState(preset: Partial<Mmj.PlayerState> = {}): Mmj.PlayerState {
	return {
		user1House: 'e',
		user2House: 's',
		user3House: 'w',
		user4House: 'n',
		round: 'e',
		kyoku: 1,
		turnCount: 0,
		tilesCount: 69,
		doraIndicateTiles: [125],
		drawnTile: null,
		handTiles: {
			e: [1, 5, 9, 13, 21, 25, 29, 33, 37, 41, 45, 49, 53],
			s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
		},
		hoTiles: { e: [], s: [], w: [], n: [] },
		huros: { e: [], s: [], w: [], n: [] },
		firstTurnFlags: { e: false, s: false, w: false, n: false },
		riichis: { e: false, s: false, w: false, n: false },
		riichiTiles: { e: null, s: null, w: null, n: null },
		doubleRiichis: { e: false, s: false, w: false, n: false },
		ippatsus: { e: false, s: false, w: false, n: false },
		rinshanFlags: { e: false, s: false, w: false, n: false },
		points: { e: 25000, s: 25000, w: 25000, n: 25000 },
		latestDahaiedTile: null,
		turn: 'e',
		canPon: null,
		canCii: null,
		canKan: null,
		canRon: null,
		...preset,
	};
}

function renderRoomGame(state: Mmj.PlayerState, isEnded = false) {
	const connection = createConnection();
	const user = (id: string) => ({ id, username: id, name: null });
	const result = render(RoomGame, {
		props: {
			room: {
				id: 'room',
				isStarted: true,
				isEnded,
				user1Id: 'u1',
				user2Id: 'u2',
				user3Id: 'u3',
				user4Id: 'u4',
				user1: user('u1'),
				user2: user('u2'),
				user3: user('u3'),
				user4: user('u4'),
				timeLimitForEachTurn: 30,
				gameState: state,
			} as never,
			connection: connection as never,
		},
	});
	return { ...result, connection };
}

function handTileImage(container: Element, fileName: string): HTMLImageElement {
	const hand = container.querySelector('[class*="handTilesOfMe"]');
	assert.ok(hand, 'hand tiles should be rendered');
	const image = Array.from(hand.querySelectorAll('img')).find(img => img.getAttribute('src')?.endsWith(`/tiles/${fileName}.png`));
	assert.ok(image, `hand tile ${fileName} should be rendered`);
	return image;
}

async function clickHandTile(container: Element, fileName: string) {
	const image = handTileImage(container, fileName);
	await fireEvent.click(image.parentElement!.parentElement!);
}

async function findKakanButton(buttons: HTMLElement[]): Promise<HTMLElement> {
	const button = buttons.find(b => b.textContent?.includes('加槓'));
	assert.ok(button, 'kakan button should be visible');
	return button;
}

function sentActions(send: ReturnType<typeof vi.fn>, type: string) {
	return send.mock.calls.filter(([name]) => name === type);
}

afterEach(() => {
	cleanup();
});

describe('room.game kakan', () => {
	test('sends kakan immediately when only one tile can be kakan-ed', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			huros: { e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }], s: [], w: [], n: [] },
			handTiles: {
				e: [20, 1, 5, 9, 13, 21, 25, 29, 33, 37, 41, 45, 49],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const button = await findKakanButton(await findAllByRole('button'));
		await fireEvent.click(button);

		assert.deepStrictEqual(sentActions(connection.send, 'kakan'), [['kakan', { tile: 20 }]]);
		assert.strictEqual(sentActions(connection.send, 'dahai').length, 0);
	});

	test('lets the player pick the pon when more than one can be kakan-ed', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			huros: {
				e: [
					{ type: 'pon', tiles: [17, 18, 19], from: 's' },
					{ type: 'pon', tiles: [69, 70, 71], from: 'w' },
				],
				s: [], w: [], n: [],
			},
			handTiles: {
				e: [20, 72, 1, 5, 9, 13, 21, 25, 29, 33, 37, 41, 45],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const button = await findKakanButton(await findAllByRole('button'));
		await fireEvent.click(button);
		assert.strictEqual(sentActions(connection.send, 'kakan').length, 0);

		await clickHandTile(container, 'p9');
		assert.deepStrictEqual(sentActions(connection.send, 'kakan'), [['kakan', { tile: 72 }]]);
	});

	test('clears a pending kakan selection when the turn changes', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			huros: {
				e: [
					{ type: 'pon', tiles: [17, 18, 19], from: 's' },
					{ type: 'pon', tiles: [69, 70, 71], from: 'w' },
				],
				s: [], w: [], n: [],
			},
			handTiles: {
				e: [20, 72, 1, 5, 9, 13, 21, 25, 29, 33, 37, 41, 45],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const button = await findKakanButton(await findAllByRole('button'));
		await fireEvent.click(button);

		// 自分のツモで選択状態を解除し、次の打牌は通常の dahai になる
		connection.emit('tsumo', { house: 'e', tile: 1 });
		await new Promise(resolve => setTimeout(resolve, 0));
		await clickHandTile(container, 'p9');

		assert.deepStrictEqual(sentActions(connection.send, 'dahai'), [['dahai', { tile: 72, riichi: false }]]);
		assert.strictEqual(sentActions(connection.send, 'kakan').length, 0);
	});

	test('sends ankan immediately when only one tile type can be ankan-ed', async () => {
		const { findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [1, 2, 3, 4, 5, 9, 13, 21, 25, 29, 33, 37, 41],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const buttons = await findAllByRole('button');
		const ankanButton = buttons.find(b => b.textContent?.includes('暗槓'));
		assert.ok(ankanButton, 'ankan button should be visible');
		await fireEvent.click(ankanButton);

		assert.deepStrictEqual(sentActions(connection.send, 'ankan'), [['ankan', { tile: 1 }]]);
		assert.strictEqual(sentActions(connection.send, 'dahai').length, 0);
	});

	test('lets the player pick the tile when more than one can be ankan-ed', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 21, 25, 29],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const buttons = await findAllByRole('button');
		const ankanButton = buttons.find(b => b.textContent?.includes('暗槓'));
		assert.ok(ankanButton, 'ankan button should be visible');
		await fireEvent.click(ankanButton);
		assert.strictEqual(sentActions(connection.send, 'ankan').length, 0);

		await clickHandTile(container, 'm1');
		assert.deepStrictEqual(sentActions(connection.send, 'ankan'), [['ankan', { tile: 1 }]]);
	});

	test('cancels an ankan selection and discards normally afterwards', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 21, 25, 29],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const buttons = await findAllByRole('button');
		const isCancel = (b: HTMLElement) => b.textContent?.includes('Cancel') === true || b.textContent?.includes('キャンセル') === true;
		assert.ok(!buttons.some(isCancel), 'cancel button should be hidden before selection');
		const ankanButton = buttons.find(b => b.textContent?.includes('暗槓'));
		assert.ok(ankanButton, 'ankan button should be visible');
		await fireEvent.click(ankanButton);

		const selecting = await findAllByRole('button');
		const cancelButton = selecting.find(isCancel);
		assert.ok(cancelButton, 'cancel button should be visible during tile selection');
		await fireEvent.click(cancelButton);

		await clickHandTile(container, 'm1');
		assert.deepStrictEqual(sentActions(connection.send, 'dahai'), [['dahai', { tile: 1, riichi: false }]]);
		assert.strictEqual(sentActions(connection.send, 'ankan').length, 0);
	});

	test('discards normally when no tile selection is active', async () => {
		const { container, connection } = renderRoomGame(createPlayerState());

		await clickHandTile(container, 'm1');
		assert.deepStrictEqual(sentActions(connection.send, 'dahai'), [['dahai', { tile: 1, riichi: false }]]);
	});

	test('still sends a riichi discard with the riichi flag', async () => {
		const state = createPlayerState({
			drawnTile: 58,
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 53, 57],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		});
		const { container, findAllByRole, connection } = renderRoomGame(state);

		const buttons = await findAllByRole('button');
		const riichiButton = buttons.find(b => b.textContent?.includes('リーチ'));
		assert.ok(riichiButton, 'riichi button should be visible');
		await fireEvent.click(riichiButton);

		const riichiTypes = Mmj.getTilesForRiichi(state.handTiles.e.map(id => Mmj.findTileByIdOrFail(id).t));
		assert.ok(riichiTypes.length > 0);
		const tileImage = Array.from(container.querySelector('[class*="handTilesOfMe"]')!.querySelectorAll('img'))
			.find(img => img.getAttribute('src')?.endsWith(`/tiles/${riichiTypes[0]}.png`));
		assert.ok(tileImage, 'riichi discard tile should be selectable');
		await fireEvent.click(tileImage.parentElement!.parentElement!);

		const dahai = sentActions(connection.send, 'dahai');
		assert.strictEqual(dahai.length, 1);
		assert.strictEqual(dahai[0][1].riichi, true);
	});

	test('kakan overrides a preceding ankan selection', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			huros: {
				e: [
					{ type: 'pon', tiles: [17, 18, 19], from: 's' },
					{ type: 'pon', tiles: [69, 70, 71], from: 'w' },
				],
				s: [], w: [], n: [],
			},
			handTiles: {
				e: [1, 2, 3, 4, 5, 6, 7, 8, 20, 72, 9, 13, 21],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
		}));

		const buttons = await findAllByRole('button');
		const ankanButton = buttons.find(b => b.textContent?.includes('暗槓'));
		assert.ok(ankanButton, 'ankan button should be visible');
		await fireEvent.click(ankanButton);

		const kakanButton = await findKakanButton(buttons);
		await fireEvent.click(kakanButton);

		await clickHandTile(container, 'm5r');
		assert.deepStrictEqual(sentActions(connection.send, 'kakan'), [['kakan', { tile: 20 }]]);
		assert.strictEqual(sentActions(connection.send, 'ankan').length, 0);
	});

	test('shows ron on kakanDeclared when waiting on the kakan tile', async () => {
		const { queryAllByRole, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 's',
			handTiles: {
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
			huros: {
				e: [],
				s: [{ type: 'pon', tiles: [69, 70, 71], from: 'e' }],
				w: [],
				n: [],
			},
		}));

		const before = queryAllByRole('button');
		assert.ok(!before.some(b => b.textContent?.includes('ロン')), 'ron button should be hidden before declare');

		connection.emit('kakanDeclared', { house: 's', tiles: [72, 69, 70, 71], from: 'e', doraIndicateTiles: [125, 121] });
		await new Promise(resolve => setTimeout(resolve, 0));

		const after = await findAllByRole('button');
		assert.ok(after.some(b => b.textContent?.includes('ロン')), 'ron button should be visible on kakan declare');
	});

	test('adds the rinshan tile only on kakanned, not on kakanDeclared', async () => {
		const { container, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [72, 13, 17, 21, 25, 29, 33, 37, 41, 109, 121, 45, 49],
				s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				n: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
			},
			huros: {
				e: [{ type: 'pon', tiles: [69, 70, 71], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
		}));

		const countHandTiles = () => container.querySelector('[class*="handTilesOfMe"]')!.querySelectorAll('img').length;
		const before = countHandTiles();

		connection.emit('kakanDeclared', { house: 'e', tiles: [72, 69, 70, 71], from: 's', doraIndicateTiles: [125, 121] });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(countHandTiles(), before - 1);

		connection.emit('kakanned', { house: 'e', tiles: [72, 69, 70, 71], rinsyan: 34, from: 's', doraIndicateTiles: [125, 121] });
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(countHandTiles(), before);
	});

	test('shows a persistent riichi badge on the riichi house', async () => {
		// myHouse は e。席と家の対応: 対面=w, 上家=n, 下家=s, 自家=e
		const seats = [
			{ key: 'playerOfToimen', house: 'w' },
			{ key: 'playerOfKamitya', house: 'n' },
			{ key: 'playerOfSimotya', house: 's' },
			{ key: 'playerOfMe', house: 'e' },
		] as const;
		for (const { key, house } of seats) {
			const { container } = renderRoomGame(createPlayerState({
				riichis: { e: house === 'e', s: house === 's', w: house === 'w', n: house === 'n' },
			}));
			for (const seat of seats) {
				const el = container.querySelector(`[class*="${seat.key}"]`);
				assert.ok(el, `${seat.key} player should be rendered`);
				if (seat.key === key) {
					assert.ok(el.textContent?.includes('リーチ'), `riichi badge should be shown on ${seat.key} for riichi house ${house}`);
				} else {
					assert.ok(!el.textContent?.includes('リーチ'), `riichi badge should not be shown on ${seat.key} for riichi house ${house}`);
				}
			}
			cleanup();
		}
	});
});

describe('room.game stale kyoku result', () => {
	test('does not show a stale result dialog when nextKyoku arrives before the 1500ms delay', async () => {
		const ronHand = [5, 9, 13, 21, 25, 29, 41, 45, 49, 77, 81, 85, 57];
		const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const { container, connection } = renderRoomGame(createPlayerState({
			turn: null,
			riichis: { e: true, s: false, w: false, n: false },
			handTiles: { e: ronHand, s: zeros, w: zeros, n: zeros },
			hoTiles: { e: [], s: [58], w: [], n: [] },
		}));

		vi.useFakeTimers();
		try {
			connection.emit('ronned', {
				callers: ['e'],
				callee: 's',
				handTiles: { e: ronHand, s: [], w: [], n: [] },
			});
			await nextTick();

			const nextState = createPlayerState({ kyoku: 2 });
			const user = (id: string) => ({ id, username: id, name: null });
			connection.emit('nextKyoku', {
				room: {
					id: 'room',
					isStarted: true,
					isEnded: false,
					user1Id: 'u1',
					user2Id: 'u2',
					user3Id: 'u3',
					user4Id: 'u4',
					user1: user('u1'),
					user2: user('u2'),
					user3: user('u3'),
					user4: user('u4'),
					timeLimitForEachTurn: 30,
					gameState: nextState,
				},
			});
			await nextTick();

			await vi.advanceTimersByTimeAsync(2500);
			await nextTick();

			assert.ok(!container.textContent?.includes('局結果'), 'stale kyoku result dialog should not be shown in the next kyoku');
			assert.strictEqual(container.querySelector('img[src*="ron.png"]'), null, 'stale ron serif should not remain in the next kyoku');
		} finally {
			vi.useRealTimers();
		}
	});

	test('shows the ron winner once in detail and not in summary', async () => {
		const ronHand = [5, 9, 13, 21, 25, 29, 41, 45, 49, 77, 81, 85, 57];
		const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const { container, connection } = renderRoomGame(createPlayerState({
			turn: null,
			riichis: { e: true, s: false, w: false, n: false },
			handTiles: { e: ronHand, s: zeros, w: zeros, n: zeros },
			hoTiles: { e: [], s: [58], w: [], n: [] },
		}));

		vi.useFakeTimers();
		try {
			connection.emit('ronned', {
				callers: ['e'],
				callee: 's',
				handTiles: { e: ronHand, s: [], w: [], n: [] },
			});
			await nextTick();
			await vi.advanceTimersByTimeAsync(2000);
			await nextTick();

			assert.ok(container.textContent?.includes('局結果'), 'kyoku result dialog should be shown');
			const dialog = container.querySelector('[class*="kyokuResultCard"]');
			assert.ok(dialog, 'kyoku result card should be rendered');
			const names = Array.from(dialog.querySelectorAll('[class*="kyokuResultName"]')).map(el => el.textContent?.trim());
			assert.strictEqual(names.length, 4, 'each house should appear exactly once in the dialog');
			assert.strictEqual(names.filter(name => name === 'u1').length, 1, 'ron winner should appear once in detail');
			const summaryNames = Array.from(dialog.querySelector('[class*="kyokuResultSummary"]')!.querySelectorAll('[class*="kyokuResultName"]')).map(el => el.textContent?.trim());
			assert.ok(!summaryNames.includes('u1'), 'ron winner should not appear in summary');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('room.game abortive draw', () => {
	test('shows the abortive draw reason on ryuukyoku', async () => {
		vi.useFakeTimers();
		try {
			const { container, connection } = renderRoomGame(createPlayerState());
			connection.emit('ryuukyoku', {
				tenpaiHouses: [],
				notenHouses: ['e', 's', 'w', 'n'],
				pointDeltas: { e: 0, s: 0, w: 0, n: 0 },
				abortive: 'suukaikan',
			});
			await nextTick();
			await vi.advanceTimersByTimeAsync(2000);
			await nextTick();

			assert.ok(container.textContent?.includes('流局'), 'ryuukyoku result should be shown');
			assert.ok(container.textContent?.includes('四開槓による途中流局'), 'abortive draw reason should be shown');
		} finally {
			vi.useRealTimers();
		}
	});

	test('shows no reason on a normal ryuukyoku', async () => {
		vi.useFakeTimers();
		try {
			const { container, connection } = renderRoomGame(createPlayerState());
			connection.emit('ryuukyoku', {
				tenpaiHouses: ['e'],
				notenHouses: ['s', 'w', 'n'],
				pointDeltas: { e: 3000, s: -1000, w: -1000, n: -1000 },
			});
			await nextTick();
			await vi.advanceTimersByTimeAsync(2000);
			await nextTick();

			assert.ok(container.textContent?.includes('流局'), 'ryuukyoku result should be shown');
			assert.ok(!container.textContent?.includes('による途中流局'), 'no abortive draw reason should be shown');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('room.game tsumo', () => {
	test('hides action buttons after tsumo press and restores on next event', async () => {
		const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const { container, findAllByRole, queryAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10],
				s: zeros,
				w: zeros,
				n: zeros,
			},
		}));

		// 自分のツモで和了可能にする（iTsumoed が立つ）
		connection.emit('tsumo', { house: 'e', tile: 11 });
		await nextTick();

		const buttons = await findAllByRole('button');
		const tsumoButton = buttons.find(b => b.textContent?.includes('ツモ'));
		assert.ok(tsumoButton, 'tsumo button should be visible after tsumo');

		const actionsOf = () => container.querySelector('[class*="actions"]');
		assert.ok(actionsOf(), 'actions should be visible before tsumo press');

		await fireEvent.click(tsumoButton);
		await nextTick();

		assert.deepStrictEqual(sentActions(connection.send, 'tsumoHora'), [['tsumoHora', {}]]);
		assert.strictEqual(actionsOf(), null, 'actions should be hidden after tsumo press');

		// 次のサーバイベントで表示に戻り、手番が移ればツモは残らない
		connection.emit('tsumo', { house: 's', tile: 1 });
		await nextTick();

		assert.ok(actionsOf(), 'actions should be restored on next event');
		assert.ok(!queryAllByRole('button').some(b => b.textContent?.includes('ツモ')), 'tsumo button should not remain when turn moves');
	});

	test('ignores hand tile clicks while tsumo is pending', async () => {
		const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10],
				s: zeros,
				w: zeros,
				n: zeros,
			},
		}));

		connection.emit('tsumo', { house: 'e', tile: 11 });
		await nextTick();

		const tsumoButton = (await findAllByRole('button')).find(b => b.textContent?.includes('ツモ'));
		assert.ok(tsumoButton, 'tsumo button should be visible after tsumo');
		await fireEvent.click(tsumoButton);
		await nextTick();

		await clickHandTile(container, 'm1');
		await nextTick();

		assert.deepStrictEqual(sentActions(connection.send, 'tsumoHora'), [['tsumoHora', {}]]);
		assert.strictEqual(sentActions(connection.send, 'dahai').length, 0, 'dahai should not be sent while tsumo is pending');
		assert.strictEqual(sentActions(connection.send, 'ankan').length, 0, 'ankan should not be sent while tsumo is pending');
	});

	test('tsumo press during riichi selection sends tsumoHora and drops the selection', async () => {
		const zeros = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		const { container, findAllByRole, queryAllByRole, connection } = renderRoomGame(createPlayerState({
			turn: 'e',
			handTiles: {
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10],
				s: zeros,
				w: zeros,
				n: zeros,
			},
		}));

		connection.emit('tsumo', { house: 'e', tile: 11 });
		await nextTick();

		const riichiButton = (await findAllByRole('button')).find(b => b.textContent?.includes('リーチ'));
		assert.ok(riichiButton, 'riichi button should be visible');
		await fireEvent.click(riichiButton);
		await nextTick();
		assert.ok(queryAllByRole('button').some(b => b.textContent?.includes('キャンセル') === true || b.textContent?.includes('Cancel') === true), 'cancel button should be visible during tile selection');

		const tsumoButton = queryAllByRole('button').find(b => b.textContent?.includes('ツモ'));
		assert.ok(tsumoButton, 'tsumo button should be visible during tile selection');
		await fireEvent.click(tsumoButton);
		await nextTick();

		assert.deepStrictEqual(sentActions(connection.send, 'tsumoHora'), [['tsumoHora', {}]]);
		assert.strictEqual(container.querySelector('[class*="actions"]'), null, 'actions should be hidden after tsumo press');

		// 選択中でもツモ送信後は手牌クリックが無視される（リーチ打牌にならない）
		await clickHandTile(container, 'm1');
		await nextTick();
		assert.strictEqual(sentActions(connection.send, 'dahai').length, 0, 'dahai should not be sent while tsumo is pending');

		// 次イベントで復帰し、選択は破棄されているので通常打牌になる
		connection.emit('tsumo', { house: 'e', tile: 12 });
		await nextTick();
		assert.ok(container.querySelector('[class*="actions"]'), 'actions should be restored on next event');

		await clickHandTile(container, 'm1');
		await nextTick();
		const dahai = sentActions(connection.send, 'dahai');
		assert.strictEqual(dahai.length, 1, 'normal dahai should be sent after restore');
		assert.strictEqual(dahai[0][1].riichi, false, 'selection should be discarded, not a riichi discard');
	});
});

describe('room.game ended result', () => {
	test('sorts ended rows by points in descending order', async () => {
		const { container } = renderRoomGame(createPlayerState({
			points: { e: 20000, s: 35000, w: 25000, n: 30000 },
		}), true);
		await nextTick();

		const points = Array.from(container.querySelectorAll('[class*="kyokuResultEndPoints"]'))
			.map(el => el.textContent?.trim());
		assert.deepStrictEqual(points, ['35000点', '30000点', '25000点', '20000点']);
	});
});

describe('room.game riichi river', () => {
	test('renders the riichi discard sideways', async () => {
		const { container } = renderRoomGame(createPlayerState({
			hoTiles: { e: [1, 5, 9], s: [], w: [], n: [] },
			riichis: { e: true, s: false, w: false, n: false },
			riichiTiles: { e: 9, s: null, w: null, n: null },
		}));
		await nextTick();

		const river = container.querySelector('[class*="hoTilesOfMe"]');
		assert.ok(river, 'own river should be rendered');
		const backgrounds = Array.from(river.querySelectorAll('img'))
			.filter(img => img.getAttribute('src')?.includes('/mahjong/putted-tile-') ?? false);
		assert.strictEqual(backgrounds.length, 3);
		assert.strictEqual(backgrounds[0].getAttribute('src'), '/client-assets/mahjong/putted-tile-1.png');
		assert.strictEqual(backgrounds[1].getAttribute('src'), '/client-assets/mahjong/putted-tile-1.png');
		assert.strictEqual(backgrounds[2].getAttribute('src'), '/client-assets/mahjong/putted-tile-3.png');
	});
});
