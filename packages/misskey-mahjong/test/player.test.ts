/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert';
import { TileId } from '../src/common.js';
import { PlayerGameEngine, PlayerState } from '../src/engine.player.js';

function createState(): PlayerState {
	return {
		user1House: 'e',
		user2House: 's',
		user3House: 'w',
		user4House: 'n',
		round: 'e',
		kyoku: 1,
		turnCount: 0,
		tilesCount: 69,
		doraIndicateTiles: [125], // 白表示 → ドラは發(手牌にない)
		handTiles: { e: [], s: [], w: [], n: [] },
		hoTiles: { e: [], s: [], w: [], n: [] },
		huros: { e: [], s: [], w: [], n: [] },
		firstTurnFlags: { e: false, s: false, w: false, n: false },
		riichis: { e: false, s: false, w: false, n: false },
		doubleRiichis: { e: false, s: false, w: false, n: false },
		ippatsus: { e: false, s: false, w: false, n: false },
		rinshanFlags: { e: false, s: false, w: false, n: false },
		points: { e: 25000, s: 25000, w: 25000, n: 25000 },
		latestDahaiedTile: null,
		turn: null,
		canPon: null,
		canCii: null,
		canKan: null,
		canRon: null,
	};
}

describe('Player game engine scoring', () => {
	it('Child riichi tsumo with 2 han 40 fu = 700/400 (1500 total)', () => {
		const state = createState();
		state.riichis.s = true;

		const engine = new PlayerGameEngine(2, state);
		const handTiles: TileId[] = [
			1, 5, 9, // m1 m2 m3
			57, 58, 59, // p6 x3
			93, 97, 101, // s6 s7 s8
			121, 122, 123, // n x3
			10, 11, // m3 x2 (和了牌)
		];
		const result = engine.commit_tsumoHora('s', handTiles, 11);

		assert.deepStrictEqual(result.yakus.map(yaku => yaku.name).sort(), ['riichi', 'tsumo']);
		assert.strictEqual(result.doraCount, 0);
		assert.deepStrictEqual(result.pointDeltas, {
			e: -1300,
			s: 2700,
			w: -700,
			n: -700,
		});
	});

	it('Dealer riichi pinfu ron with 2 han 30 fu = 2900', () => {
		const state = createState();
		state.riichis.e = true;
		state.hoTiles.s = [69]; // p9

		const engine = new PlayerGameEngine(1, state);
		const handTiles = {
			e: [
				1, 5, 9, // m1 m2 m3
				45, 49, 53, // p3 p4 p5
				93, 97, 101, // s6 s7 s8
				61, 65, // p7 p8
				77, 78, // s2 x2
			],
			s: [],
			w: [],
			n: [],
		};
		const result = engine.commit_ronHora(['e'], 's', handTiles);

		assert.deepStrictEqual(result.e?.yakus.map(yaku => yaku.name).sort(), ['pinfu', 'riichi']);
		assert.strictEqual(result.e?.doraCount, 0);
		assert.deepStrictEqual(result.e?.pointDeltas, {
			e: 2900,
			s: -2900,
			w: 0,
			n: 0,
		});
	});
});

describe('Player game engine dora indicators', () => {
	it('updates dora indicators on daiminkan', () => {
		const state = createState();
		state.turn = 's';
		state.handTiles.s = [1, 2, 3];
		state.hoTiles.e = [57];

		const engine = new PlayerGameEngine(1, state);
		engine.commit_kan('s', 'e', [57, 58, 59, 60], 17, [125, 121]);

		assert.deepStrictEqual(engine.doraIndicateTiles, [125, 121]);
	});

	it('updates dora indicators on kakan', () => {
		const state = createState();
		state.turn = 's';
		state.handTiles.s = [1, 2, 3];
		state.huros.s = [{ type: 'pon', tiles: [57, 58, 59], from: 'e' }];

		const engine = new PlayerGameEngine(1, state);
		engine.commit_kakan('s', [57, 58, 59, 60], 17, [125, 121, 122]);

		assert.deepStrictEqual(engine.doraIndicateTiles, [125, 121, 122]);
	});

	it('updates dora indicators on ankan', () => {
		const state = createState();
		state.turn = 's';
		state.handTiles.s = [1, 2, 3, 4];

		const engine = new PlayerGameEngine(1, state);
		engine.commit_ankan('s', [1, 2, 3, 4], 17, [125, 121, 122, 123]);

		assert.deepStrictEqual(engine.doraIndicateTiles, [125, 121, 122, 123]);
	});
});

describe('Player game engine ryuukyoku', () => {
	it('applies point deltas and clears turn', () => {
		const state = createState();
		state.points = { e: 24000, s: 26000, w: 25000, n: 25000 };
		state.turn = 'e';

		const engine = new PlayerGameEngine(1, state);
		engine.commit_ryuukyoku({ e: 3000, s: -1000, w: -1000, n: -1000 });

		assert.deepStrictEqual(engine.points, { e: 27000, s: 25000, w: 24000, n: 24000 });
		assert.strictEqual(engine.turn, null);
	});
});
