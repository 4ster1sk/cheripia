/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, vi } from 'vitest';
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

function renderRoomGame(state: Mmj.PlayerState) {
	const connection = createConnection();
	const user = (id: string) => ({ id, username: id, name: null });
	const result = render(RoomGame, {
		props: {
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

	test('still supports ankan selection', async () => {
		const { container, findAllByRole, connection } = renderRoomGame(createPlayerState({
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

		await clickHandTile(container, 'm1');
		assert.deepStrictEqual(sentActions(connection.send, 'ankan'), [['ankan', { tile: 1 }]]);
	});

	test('discards normally when no tile selection is active', async () => {
		const { container, connection } = renderRoomGame(createPlayerState());

		await clickHandTile(container, 'm1');
		assert.deepStrictEqual(sentActions(connection.send, 'dahai'), [['dahai', { tile: 1, riichi: false }]]);
	});

	test('still sends a riichi discard with the riichi flag', async () => {
		const state = createPlayerState({
			drawnTile: 57,
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
				e: [1, 2, 3, 4, 20, 72, 5, 9, 13, 21, 25, 29, 33],
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
});
