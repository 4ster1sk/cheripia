/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Common from '../src/common.js';
import { House, TileType, TileId } from '../src/common.js';
import { MasterGameEngine, MasterState, INITIAL_POINT, isTobiPoints, AbortiveDrawError } from '../src/engine.master.js';
import type { AbortiveDrawKind } from '../src/engine.master.js';

const TILES = [71, 132, 108, 51, 39, 19, 3, 86, 104, 18, 50, 7, 45, 82, 43, 34, 111, 78, 53, 105, 126, 91, 112, 75, 119, 55, 95, 93, 65, 9, 66, 52, 79, 32, 99, 109, 56, 5, 101, 92, 1, 37, 62, 23, 27, 117, 77, 14, 31, 96, 120, 130, 29, 135, 100, 17, 102, 124, 59, 89, 49, 115, 107, 97, 90, 48, 25, 110, 68, 15, 74, 129, 69, 61, 73, 81, 11, 41, 44, 84, 13, 40, 33, 58, 30, 8, 38, 10, 87, 125, 57, 121, 21, 2, 54, 46, 22, 4, 133, 16, 76, 70, 60, 103, 114, 122, 24, 88, 36, 123, 47, 12, 128, 118, 116, 63, 26, 94, 67, 131, 64, 35, 113, 134, 6, 127, 80, 72, 42, 98, 85, 20, 106, 136, 83, 28];

const INITIAL_TILES_LENGTH = 69;

class TileSetBuilder {
	private restTiles = [...TILES];

	private handTiles: Record<Common.House, TileId[] | null> = {
		e: null,
		s: null,
		w: null,
		n: null,
	};

	private tiles = new Map<number, TileId>;

	public setHandTiles(house: Common.House, tileTypes: TileType[]): this {
		if (this.handTiles[house] != null) {
			throw new TypeError(`Hand tiles of house '${house}' is already set`);
		}

		const tiles = tileTypes.map(tile => {
			const index = this.restTiles.findIndex(tileId => Common.TILE_ID_MAP.get(tileId)!.t === tile);
			if (index === -1) {
				throw new TypeError(`Tile '${tile}' is not left`);
			}
			return this.restTiles.splice(index, 1)[0];
		});

		this.handTiles[house] = tiles;

		return this;
	}

	/**
	 * 山のn番目（0始まり）の牌を指定する。nが負の場合、海底を-1として海底側から数える
	 */
	public setTile(n: number, tileType: TileType): this {
		if (n < 0) {
			n += INITIAL_TILES_LENGTH;
		}

		if (n < 0 || n >= INITIAL_TILES_LENGTH) {
			throw new RangeError(`Cannot set ${n}th tile`);
		}

		const indexInTiles = INITIAL_TILES_LENGTH - n - 1;

		if (this.tiles.has(indexInTiles)) {
			throw new TypeError(`${n}th tile is already set`);
		}

		const indexInRestTiles = this.restTiles.findIndex(tileId => Common.TILE_ID_MAP.get(tileId)!.t === tileType);
		if (indexInRestTiles === -1) {
			throw new TypeError(`Tile '${tileType}' is not left`);
		}
		this.tiles.set(indexInTiles, this.restTiles.splice(indexInRestTiles, 1)[0]);

		return this;
	}

	public build(): Pick<MasterState, 'tiles' | 'kingTiles' | 'handTiles'> {
		const handTiles: MasterState['handTiles'] = {
			e: this.handTiles.e ?? this.restTiles.splice(0, 14),
			s: this.handTiles.s ?? this.restTiles.splice(0, 13),
			w: this.handTiles.w ?? this.restTiles.splice(0, 13),
			n: this.handTiles.n ?? this.restTiles.splice(0, 13),
		};

		const kingTiles: MasterState['kingTiles'] = this.restTiles.splice(0, 14);

		const tiles = [...this.restTiles];
		for (const [index, tile] of [...this.tiles.entries()].sort(([index1], [index2]) => index1 - index2)) {
			tiles.splice(index, 0, tile);
		}

		return {
			tiles,
			kingTiles,
			handTiles,
		};
	}
}

function tsumogiri(engine: MasterGameEngine, riichi = false): void {
	const house = engine.turn;
	if (house == null) {
		throw new Error('No one\'s turn');
	}
	engine.commit_dahai(house, engine.handTiles[house].at(-1)!, riichi);
}

function tsumogiriAndIgnore(engine: MasterGameEngine, riichi = false): void {
	tsumogiri(engine, riichi);
	if (engine.askings.pon != null || engine.askings.cii != null || engine.askings.kan != null || engine.askings.ron != null) {
		engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: [],
		});
	}
}

describe('Master game engine', () => {
	it('tenho', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder().setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 'm3']).build(),
		));
		expect(engine.commit_tsumoHora('e', false).yakus.yakuNames).toEqual(['tenho']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 48000,
			s: INITIAL_POINT - 16000,
			w: INITIAL_POINT - 16000,
			n: INITIAL_POINT - 16000,
		});
	});

	it('chiho', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('s', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3'])
				.setTile(0, 'm3')
				.build(),
		));
		tsumogiriAndIgnore(engine);
		expect(engine.commit_tsumoHora('s', false).yakus.yakuNames).toEqual(['chiho']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT - 16000,
			s: INITIAL_POINT + 32000,
			w: INITIAL_POINT - 8000,
			n: INITIAL_POINT - 8000,
		});
	});

	it('rinshan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 'n'])
				.setTile(-1, 'm3')
				.build(),
		));
		// 嶺上牌は王牌末尾から取るため、生き壁先頭(旧嶺上位置)のm3を王牌末尾へ移す (一意性維持のため交換)。
		const lastKing = engine.$state.kingTiles.length - 1;
		const tmpRinshan = engine.$state.kingTiles[lastKing];
		engine.$state.kingTiles[lastKing] = engine.$state.tiles[0];
		engine.$state.tiles[0] = tmpRinshan;
		engine.commit_ankan('e', engine.$state.handTiles.e.at(-1)!);
		engine.$state.kingTiles[0] = 125; // ドラ表示牌を白にして、和了者の手牌にドラが乗らないようにする
		expect(engine.commit_tsumoHora('e', false).yakus.yakuNames).toEqual(['tsumo', 'rinshan']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 6000,
			s: INITIAL_POINT - 2000,
			w: INITIAL_POINT - 2000,
			n: INITIAL_POINT - 2000,
		});
	});

	it('double-riichi ippatsu tsumo', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 's'])
				.setTile(3, 'm3')
				.build(),
		));
		tsumogiriAndIgnore(engine, true);
		tsumogiriAndIgnore(engine);
		tsumogiriAndIgnore(engine);
		tsumogiriAndIgnore(engine);
		engine.$state.kingTiles[0] = 125; // ドラ表示牌を白にして、和了者の手牌にドラが乗らないようにする
		expect(engine.commit_tsumoHora('e', false).yakus.yakuNames).toEqual(['tsumo', 'double-riichi', 'ippatsu']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 12000,
			s: INITIAL_POINT - 4000,
			w: INITIAL_POINT - 4000,
			n: INITIAL_POINT - 4000,
		});
	});

	it('double-riichi haitei tsumo', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('s', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3'])
				.setTile(-1, 'm3')
				.build(),
		));
		tsumogiriAndIgnore(engine);
		tsumogiriAndIgnore(engine, true);
		while (engine.$state.tiles.length > 0) {
			tsumogiriAndIgnore(engine);
		}
		expect(engine.commit_tsumoHora('s', false).yakus.yakuNames).toEqual(['tsumo', 'double-riichi', 'haitei']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT - 4000,
			s: INITIAL_POINT + 8000,
			w: INITIAL_POINT - 2000,
			n: INITIAL_POINT - 2000,
		});
	});

	it('double-riichi hotei', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 's'])
				.setHandTiles('s', ['m3', 'm6', 'p2', 'p5', 'p8', 's4', 'e', 's', 'w', 'haku', 'hatsu', 'chun', 'chun'])
				.setTile(-1, 'm3')
				.build(),
		));
		tsumogiriAndIgnore(engine, true);
		while (engine.$state.tiles.length > 0) {
			tsumogiriAndIgnore(engine);
		}
		tsumogiri(engine);
		engine.$state.kingTiles[0] = 125; // ドラ表示牌を白にして、和了者の手牌にドラが乗らないようにする
		expect(engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: ['e'],
		}, false).yakus?.e?.yakuNames).toEqual(['double-riichi', 'hotei']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 9600,
			s: INITIAL_POINT - 9600,
			w: INITIAL_POINT,
			n: INITIAL_POINT,
		});
	});

	it('rotates points with player seats on next kyoku', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState());
		engine.$state.points = {
			e: 30000,
			s: 24000,
			w: 20000,
			n: 16000,
		};

		// 子の和了による親流れでは席が回転する
		engine.commit_nextKyoku('s', []);

		// 席は e -> s -> w -> n -> e と移動する
		expect(engine.$state.user1House).toBe('s');
		expect(engine.$state.user2House).toBe('w');
		expect(engine.$state.user3House).toBe('n');
		expect(engine.$state.user4House).toBe('e');

		// 点数は席ではなくプレイヤーに追随する
		expect(engine.getHouse(1)).toBe('s');
		expect(engine.$state.points).toEqual({
			e: 16000,
			s: 30000,
			w: 24000,
			n: 20000,
		});
	});
});

describe('Master game engine state transitions', () => {
	it('replaces the pon with a minkan on kakan and keeps the hand winable', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				// m1 m2 p6x3 s6 s7 s8 n n + 加槓する4枚目のm5
				e: [1, 5, 57, 58, 59, 93, 97, 101, 121, 122, 20],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125, 9], // ドラ表示牌は白。嶺上牌(m3)は王牌末尾
			activatedDorasCount: 1,
			turn: 'e',
		}));

		const res = engine.commit_kakan('e', 20);

		expect(res.tiles).toEqual([20, 17, 18, 19]);
		expect(res.from).toBe('s');
		// ポンはミンカンに置換され、副露の個数は増えない
		expect(engine.$state.huros.e).toHaveLength(1);
		expect(engine.$state.huros.e[0]).toEqual({
			type: 'minkan',
			tiles: [20, 17, 18, 19],
			from: 's',
			kakan: true,
		});
		expect(engine.$state.handTiles.e).toHaveLength(11);
		expect(engine.$state.handTiles.e).not.toContain(20);
		expect(engine.$state.handTiles.e).toContain(9);
		expect(engine.$state.drawnTile).toBe(9);

		// 置換後の形でも和了判定が壊れない (ミンカンは門前ではないのでツモ役は付かない)
		const hora = engine.commit_tsumoHora('e', false);
		expect(hora.yakus.yakuNames).toContain('rinshan');
	});

	it('reveals an additional dora indicator after each kan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				// m1x4 (暗槓用) + m2x4 (2回目の暗槓用) + m3x2 + 加槓する4枚目のm5
				e: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34], // 嶺上牌(m9)x2
			kingTiles: [125, 121, 122, 123],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		expect(engine.doraIndicateTiles).toEqual([125]);

		engine.commit_kakan('e', 20);
		expect(engine.doraIndicateTiles).toEqual([125, 121]);
		expect(engine.$state.drawnTile).toBe(123);

		engine.commit_ankan('e', 1);
		expect(engine.doraIndicateTiles).toEqual([125, 121, 122]);
		expect(engine.$state.drawnTile).toBe(122);

		expect(engine.$state.activatedDorasCount).toBe(3);
	});

	it('rejects kakan when the tile is not in hand without removing the last hand tile', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 57, 58, 59, 93, 97, 101, 121],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		const handBefore = [...engine.$state.handTiles.e];

		expect(() => engine.commit_kakan('e', 20)).toThrow('No such tile in your hand');

		expect(engine.$state.handTiles.e).toEqual(handBefore);
		expect(engine.$state.huros.e).toHaveLength(1);
		expect(engine.$state.huros.e[0].type).toBe('pon');
	});

	it('rejects ankan out of turn', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				s: [57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		expect(() => engine.commit_ankan('s', 57)).toThrow('Not your turn');
		expect(engine.$state.handTiles.s).toHaveLength(13);
		expect(engine.$state.huros.s).toHaveLength(0);
	});

	it('rejects kakan out of turn', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				s: [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85],
				w: [],
				n: [],
			},
			huros: {
				e: [],
				s: [{ type: 'pon', tiles: [89, 90, 91], from: 'e' }],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		expect(() => engine.commit_kakan('s', 92)).toThrow('Not your turn');
		expect(engine.$state.handTiles.s).toHaveLength(13);
		expect(engine.$state.huros.s).toHaveLength(1);
		expect(engine.$state.huros.s[0].type).toBe('pon');
	});

	it('rejects kakan while in riichi', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 57, 58, 59, 93, 97, 101, 121, 20],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			riichis: {
				e: true,
				s: false,
				w: false,
				n: false,
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		expect(() => engine.commit_kakan('e', 20)).toThrow('Cannot kakan during riichi');
		expect(engine.$state.handTiles.e).toContain(20);
		expect(engine.$state.huros.e).toHaveLength(1);
		expect(engine.$state.huros.e[0].type).toBe('pon');
	});

	it('rejects riichi with call huros but allows riichi with ankan', () => {
		const handTiles = [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 33, 34, 35, 36];
		const engineWithPon = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: handTiles,
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		expect(() => engineWithPon.commit_dahai('e', 33, true)).toThrow('Cannot riichi with call huros');
		expect(engineWithPon.$state.riichis.e).toBe(false);

		const engineWithAnkan = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				// 打牌後に m1m2m3 p6x3 s6s7s8 n の10枚でn待ち
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 33],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'ankan', tiles: [17, 18, 19, 20] }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		engineWithAnkan.commit_dahai('e', 33, true);

		expect(engineWithAnkan.$state.riichis.e).toBe(true);
		expect(engineWithAnkan.$state.huros.e).toEqual([{ type: 'ankan', tiles: [17, 18, 19, 20] }]);
	});

	it.each([
		['pon', { pon: { callee: 'e', callers: ['s'] }, cii: null, kan: null }],
		['cii', { pon: null, cii: { callee: 'e', caller: 's' }, kan: null }],
		['kan', { pon: null, cii: null, kan: { callee: 'e', callers: ['s'] } }],
	] as const)('ignores a riichi player\'s %s call when resolving askings', (type, asking) => {
		const callerHandTiles: Record<'pon' | 'cii' | 'kan', TileId[]> = {
			pon: [18, 19, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69, 71],
			cii: [13, 21, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69, 71],
			kan: [18, 19, 20, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69],
		};
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				s: callerHandTiles[type],
				w: [],
				n: [],
			},
			hoTiles: {
				e: [17],
				s: [],
				w: [],
				n: [],
			},
			askings: {
				ron: null,
				pon: asking.pon,
				cii: asking.cii,
				kan: asking.kan,
			},
			riichis: {
				e: false,
				s: true,
				w: false,
				n: false,
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
		}));

		const res = engine.commit_resolveCallingInterruption({
			pon: type === 'pon',
			cii: type === 'cii' ? 'x__' : false,
			kan: type === 'kan',
			ron: [],
		});

		expect(res.type).toBe('tsumo');
		expect(engine.$state.huros.s).toHaveLength(0);
		expect(engine.$state.hoTiles.e).toEqual([17]);
	});

	it('rejects an invalid cii pattern without corrupting the state, then accepts a valid pattern', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49],
				// m5 に対して _x_ (m4,m6) のみ成立する
				s: [13, 21, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69, 71],
				w: [],
				n: [],
			},
			hoTiles: {
				e: [17],
				s: [],
				w: [],
				n: [],
			},
			askings: {
				ron: null,
				pon: null,
				cii: { callee: 'e', caller: 's' },
				kan: null,
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
		}));
		const stateBefore = structuredClone(engine.$state);

		expect(() => engine.commit_resolveCallingInterruption({
			pon: false,
			cii: 'x__',
			kan: false,
			ron: [],
		})).toThrow('Invalid cii pattern');

		// 例外時は状態が一切変更されない
		expect(engine.$state).toEqual(stateBefore);
		expect(engine.$state.askings.cii).toEqual({ callee: 'e', caller: 's' });
		expect(engine.$state.turn).toBeNull();
		expect(engine.$state.hoTiles.e).toEqual([17]);

		// 正しいパターンならそのまま解決できる
		const res = engine.commit_resolveCallingInterruption({
			pon: false,
			cii: '_x_',
			kan: false,
			ron: [],
		});

		expect(res.type).toBe('ciied');
		expect(engine.$state.hoTiles.e).toEqual([]);
		expect(engine.$state.handTiles.s).toHaveLength(11);
		expect(engine.$state.huros.s).toHaveLength(1);
		expect(engine.$state.huros.s[0]).toEqual({
			type: 'cii',
			tiles: [13, 17, 21],
			from: 'e',
			pattern: '_x_',
		});
	});
});

describe('Master game engine drawn tile', () => {
	function createCallState(
		call: {
			pon?: MasterState['askings']['pon'];
			cii?: MasterState['askings']['cii'];
			kan?: MasterState['askings']['kan'];
		},
		handTiles: TileId[],
		tiles: TileId[] = [33],
	): MasterState {
		return MasterGameEngine.createInitialState({
			handTiles: { e: [], s: handTiles, w: [], n: [] },
			hoTiles: { e: [17], s: [], w: [], n: [] },
			askings: {
				ron: null,
				pon: call.pon ?? null,
				cii: call.cii ?? null,
				kan: call.kan ?? null,
			},
			tiles,
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
			drawnTile: 34,
		});
	}

	it('treats the dealer\'s last initial tile as drawn', () => {
		const state = MasterGameEngine.createInitialState();

		expect(state.drawnTile).toBe(state.handTiles.e.at(-1));

		const engine = new MasterGameEngine(state);
		engine.commit_nextKyoku('s', []);
		expect(engine.$state.drawnTile).toBe(engine.$state.handTiles.e.at(-1));
	});

	it('clears the drawn tile on dahai', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				s: [],
				w: [],
				n: [],
			},
			tiles: [],
			turn: 'e',
		}));
		const tile = engine.$state.handTiles.e.at(-1)!;
		expect(engine.$state.drawnTile).toBe(tile);

		engine.commit_dahai('e', tile);

		expect(engine.$state.drawnTile).toBeNull();
	});

	it('sets the drawn tile on a normal tsumo', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				s: [],
				w: [],
				n: [],
			},
			tiles: [57, 58],
			turn: 'e',
		}));

		const res = engine.commit_dahai('e', engine.$state.handTiles.e.at(-1)!);
		if (res.asking || 'ryuukyoku' in res) throw new Error('unexpected result');

		expect(res.tsumoTile).toBe(58);
		expect(engine.$state.drawnTile).toBe(res.tsumoTile);
	});

	it('sets the drawn tile to the rinshan tile on ankan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 17, 21, 25],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		const res = engine.commit_ankan('e', 1);

		expect(res.rinsyan).toBe(125);
		expect(engine.$state.drawnTile).toBe(125);
	});

	it('clears the drawn tile on pon and cii', () => {
		const ponEngine = new MasterGameEngine(createCallState(
			{ pon: { callee: 'e', callers: ['s'] } },
			[18, 19, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69, 71],
		));
		expect(ponEngine.commit_resolveCallingInterruption({ pon: true, cii: false, kan: false, ron: [] }).type).toBe('ponned');
		expect(ponEngine.$state.drawnTile).toBeNull();

		const ciiEngine = new MasterGameEngine(createCallState(
			{ cii: { callee: 'e', caller: 's' } },
			[13, 21, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69, 71],
		));
		expect(ciiEngine.commit_resolveCallingInterruption({ pon: false, cii: '_x_', kan: false, ron: [] }).type).toBe('ciied');
		expect(ciiEngine.$state.drawnTile).toBeNull();
	});

	it('sets the drawn tile to the rinshan tile on daiminkan', () => {
		const kanEngine = new MasterGameEngine(createCallState(
			{ kan: { callee: 'e', callers: ['s'] } },
			[18, 19, 20, 57, 58, 59, 61, 62, 63, 65, 66, 67, 69],
		));
		const res = kanEngine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: true, ron: [] });
		expect(res.type).toBe('kanned');
		if (res.type !== 'kanned') throw new Error('unexpected result');
		// 王牌 [125]・activatedDorasCount=2 のため嶺上牌は 125
		expect(res.rinsyan).toBe(125);
		expect(kanEngine.$state.drawnTile).toBe(res.rinsyan);
		expect(kanEngine.$state.handTiles.s).toContain(res.rinsyan);
		// 自家 (s は user2) 視点でも嶺上牌がツモ牌として見える
		expect(kanEngine.createPlayerState(2).drawnTile).toBe(res.rinsyan);
		// 他家視点では見えない
		expect(kanEngine.createPlayerState(1).drawnTile).toBeNull();
		expect(kanEngine.createPlayerState(3).drawnTile).toBeNull();
	});

	it('reveals the drawn tile only to the player whose turn it is', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				s: [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50],
				w: [],
				n: [],
			},
			drawnTile: 53,
			turn: 'e',
		}));

		expect(engine.createPlayerState(1).drawnTile).toBe(53);
		expect(engine.createPlayerState(2).drawnTile).toBeNull();
		expect(engine.createSpectatorState().drawnTile).toBe(53);

		engine.$state.turn = 's';
		engine.$state.drawnTile = 2;
		expect(engine.createPlayerState(1).drawnTile).toBeNull();
		expect(engine.createPlayerState(2).drawnTile).toBe(2);
	});
});

describe('Master game engine player state', () => {
	const createState = (riichi: boolean): MasterState => MasterGameEngine.createInitialState({
		riichis: {
			e: riichi,
			s: false,
			w: false,
			n: false,
		},
		askings: {
			ron: { callee: 's', callers: ['e'] },
			pon: { callee: 's', callers: ['e'] },
			cii: { callee: 'n', caller: 'e' },
			kan: { callee: 'w', callers: ['e'] },
		},
	});

	it('hides call options for a riichi player but keeps ron', () => {
		const player = new MasterGameEngine(createState(true)).createPlayerState(1);

		expect(player.canPon).toBeNull();
		expect(player.canCii).toBeNull();
		expect(player.canKan).toBeNull();
		// リーチ中でもロンは可能
		expect(player.canRon).toEqual({ callee: 's' });
	});

	it('shows call options for a non-riichi player', () => {
		const player = new MasterGameEngine(createState(false)).createPlayerState(1);

		expect(player.canPon).toEqual({ callee: 's' });
		expect(player.canCii).toEqual({ callee: 'n' });
		expect(player.canKan).toEqual({ callee: 'w' });
		expect(player.canRon).toEqual({ callee: 's' });
	});
});

describe('Master game engine ryuukyoku', () => {
	// 門前のテンパイ: m123 p666 s678 nnn + m3 待ち
	const TENPAI_CONCEALED: TileId[] = [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10];
	// 副露ありのテンパイ: cii(m123) + p777 s999 www + m3 待ち
	const TENPAI_WITH_HURO: TileId[] = [61, 62, 63, 105, 106, 107, 117, 118, 119, 12];
	// 門前のテンパイ: m888 p123 s12345 haku pair + s3/s6 待ち
	const TENPAI_2: TileId[] = [29, 30, 31, 37, 41, 45, 73, 77, 81, 85, 89, 125, 126];
	// 門前のテンパイ: m456 m789 p789 eee + s 待ち
	const TENPAI_3: TileId[] = [13, 17, 21, 25, 32, 33, 64, 65, 69, 109, 110, 111, 113];
	// 明らかにノーテンな手牌 (すべてバラバラの牌)
	const NOTEN_HANDS: TileId[][] = [
		[13, 17, 21, 25, 33, 37, 41, 49, 53, 65, 109, 113, 125],
		[14, 18, 22, 26, 34, 38, 42, 50, 54, 66, 110, 114, 126],
		[15, 19, 23, 27, 35, 39, 43, 51, 55, 67, 111, 115, 127],
		[16, 20, 24, 28, 36, 40, 44, 52, 56, 68, 112, 116, 128],
	];
	const NOTEN_FOR_THREE_TENPAI: TileId[] = [14, 18, 22, 26, 34, 50, 54, 66, 70, 112, 129, 133, 114];

	const emptyHuros = (): MasterState['huros'] => ({ e: [], s: [], w: [], n: [] });

	function createRyuukyokuState(hands: Record<House, TileId[]>, huros: MasterState['huros'] = emptyHuros()): MasterState {
		return MasterGameEngine.createInitialState({
			tiles: [],
			handTiles: hands,
			huros,
		});
	}

	function checkRyuukyoku(
		hands: Record<House, TileId[]>,
		huros: MasterState['huros'],
		expectedTenpai: House[],
		expectedNoten: House[],
		expectedDeltas: Record<House, number>,
	) {
		const engine = new MasterGameEngine(createRyuukyokuState(hands, huros));
		const result = engine.commit_ryuukyoku();

		expect(result.tenpaiHouses).toEqual(expectedTenpai);
		expect(result.notenHouses).toEqual(expectedNoten);
		expect(result.pointDeltas).toEqual(expectedDeltas);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + expectedDeltas.e,
			s: INITIAL_POINT + expectedDeltas.s,
			w: INITIAL_POINT + expectedDeltas.w,
			n: INITIAL_POINT + expectedDeltas.n,
		});
		expect(result.pointDeltas.e + result.pointDeltas.s + result.pointDeltas.w + result.pointDeltas.n).toBe(0);
		expect(engine.turn).toBeNull();
	}

	it('detects concealed and called tenpai hands', () => {
		const engine = new MasterGameEngine(createRyuukyokuState({
			e: TENPAI_CONCEALED,
			s: TENPAI_WITH_HURO,
			w: NOTEN_HANDS[0],
			n: NOTEN_HANDS[1],
		}, {
			e: [],
			s: [{ type: 'cii', tiles: [2, 6, 11], from: 'e' }],
			w: [],
			n: [],
		}));

		expect(engine.getTenpaiHouses()).toEqual(['e', 's']);
	});

	it('applies 3000 points to the only tenpai house', () => {
		checkRyuukyoku({
			e: TENPAI_CONCEALED,
			s: NOTEN_HANDS[0],
			w: NOTEN_HANDS[1],
			n: NOTEN_HANDS[2],
		}, emptyHuros(), ['e'], ['s', 'w', 'n'], {
			e: 3000,
			s: -1000,
			w: -1000,
			n: -1000,
		});
	});

	it('applies 1500 points to each of the two tenpai houses', () => {
		checkRyuukyoku({
			e: TENPAI_CONCEALED,
			s: TENPAI_WITH_HURO,
			w: NOTEN_HANDS[0],
			n: NOTEN_HANDS[1],
		}, {
			e: [],
			s: [{ type: 'cii', tiles: [2, 6, 11], from: 'e' }],
			w: [],
			n: [],
		}, ['e', 's'], ['w', 'n'], {
			e: 1500,
			s: 1500,
			w: -1500,
			n: -1500,
		});
	});

	it('applies 1000 points to each of the three tenpai houses', () => {
		checkRyuukyoku({
			e: TENPAI_CONCEALED,
			s: TENPAI_WITH_HURO,
			w: TENPAI_2,
			n: NOTEN_FOR_THREE_TENPAI,
		}, {
			e: [],
			s: [{ type: 'cii', tiles: [2, 6, 11], from: 'e' }],
			w: [],
			n: [],
		}, ['e', 's', 'w'], ['n'], {
			e: 1000,
			s: 1000,
			w: 1000,
			n: -3000,
		});
	});

	it('does not move points when all houses are tenpai', () => {
		checkRyuukyoku({
			e: TENPAI_CONCEALED,
			s: TENPAI_WITH_HURO,
			w: TENPAI_2,
			n: TENPAI_3,
		}, {
			e: [],
			s: [{ type: 'cii', tiles: [2, 6, 11], from: 'e' }],
			w: [],
			n: [],
		}, ['e', 's', 'w', 'n'], [], {
			e: 0,
			s: 0,
			w: 0,
			n: 0,
		});
	});

	it('does not move points when all houses are noten', () => {
		checkRyuukyoku({
			e: NOTEN_HANDS[0],
			s: NOTEN_HANDS[1],
			w: NOTEN_HANDS[2],
			n: NOTEN_HANDS[3],
		}, emptyHuros(), [], ['e', 's', 'w', 'n'], {
			e: 0,
			s: 0,
			w: 0,
			n: 0,
		});
	});
});

describe('Master game engine honba and kyotaku', () => {
	it('takes a 1000 deposit on riichi', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 's'])
				.setTile(3, 'm3')
				.build(),
		));
		engine.commit_dahai('e', engine.handTiles.e.at(-1)!, true);
		expect(engine.$state.points.e).toBe(INITIAL_POINT - 1000);
		expect(engine.$state.kyotaku).toBe(1);
		expect(engine.createPlayerState(1).honba).toBe(0);
		expect(engine.createPlayerState(1).kyotaku).toBe(1);
		if (engine.askings.pon != null || engine.askings.cii != null || engine.askings.kan != null || engine.askings.ron != null) {
			engine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: false, ron: [] });
		}
	});

	it('applies honba and kyotaku on tsumo', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			honba: 2,
			kyotaku: 1,
			...new TileSetBuilder().setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 'm3']).build(),
		}));
		engine.commit_tsumoHora('e', false);
		// 天和 48000 + 本場 600 + 供託 1000
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 48000 + 600 + 1000,
			s: INITIAL_POINT - 16000 - 200,
			w: INITIAL_POINT - 16000 - 200,
			n: INITIAL_POINT - 16000 - 200,
		});
		expect(engine.$state.honba).toBe(2);
		expect(engine.$state.kyotaku).toBe(0);
	});

	it('applies honba and kyotaku on ron', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [],
				w: [],
				n: [],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: { ron: { callee: 's', callers: ['e'] }, pon: null, cii: null, kan: null },
			riichis: { e: true, s: false, w: false, n: false },
			// 残り山2枚の終盤想定のため初巡フラグは落とす (人和の誤検出防止)
			firstTurnFlags: { e: false, s: false, w: false, n: false },
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
			honba: 1,
			kyotaku: 2,
		}));
		engine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: false, ron: ['e'] }, false);
		// 素点 2900 + 本場 300、頭ハネが供託 2000 を取得
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 3200 + 2000,
			s: INITIAL_POINT - 3200,
			w: INITIAL_POINT,
			n: INITIAL_POINT,
		});
		expect(engine.$state.kyotaku).toBe(0);
	});

	it('gives kyotaku to the atamahane winner on double ron', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [],
				w: [2, 6, 11, 46, 50, 54, 94, 98, 102, 62, 66, 79, 80],
				n: [],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: { ron: { callee: 's', callers: ['e', 'w'] }, pon: null, cii: null, kan: null },
			riichis: { e: true, s: false, w: true, n: false },
			// 残り山2枚の終盤想定のため初巡フラグは落とす (人和の誤検出防止)
			firstTurnFlags: { e: false, s: false, w: false, n: false },
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
			honba: 2,
			kyotaku: 2,
		}));
		engine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: false, ron: ['e', 'w'] }, false);
		// e は親で素点 2900、w は子で素点 2000。各 +本場 600、供託 2000 は下家順で先の w が取得
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 3500,
			s: INITIAL_POINT - 6100,
			w: INITIAL_POINT + 2600 + 2000,
			n: INITIAL_POINT,
		});
		expect(engine.$state.kyotaku).toBe(0);
	});

	it('increments honba and keeps kyotaku on ryuukyoku', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			honba: 2,
			kyotaku: 3,
			tiles: [],
			handTiles: {
				e: [13, 17, 21, 25, 33, 37, 41, 49, 53, 65, 109, 113, 125],
				s: [14, 18, 22, 26, 34, 38, 42, 50, 54, 66, 110, 114, 126],
				w: [15, 19, 23, 27, 35, 39, 43, 51, 55, 67, 111, 115, 127],
				n: [16, 20, 24, 28, 36, 40, 44, 52, 56, 68, 112, 116, 128],
			},
		}));
		const result = engine.commit_ryuukyoku();
		expect(result.pointDeltas).toEqual({ e: 0, s: 0, w: 0, n: 0 });
		expect(engine.$state.honba).toBe(3);
		expect(engine.$state.kyotaku).toBe(3);
		// 親ノーテン流局のため親流れとなり、本場はリセットされる
		engine.commit_nextKyoku(null, []);
		expect(engine.$state.honba).toBe(0);
		expect(engine.$state.kyotaku).toBe(3);
	});
});

describe('Master game engine renchan and round advancement', () => {
	function createRenchanState(preset: Partial<MasterState> = {}): MasterState {
		return MasterGameEngine.createInitialState({
			round: 'e',
			kyoku: 1,
			honba: 0,
			kyotaku: 0,
			points: {
				e: 30000,
				s: 25000,
				w: 20000,
				n: 15000,
			},
			user1House: 'e',
			user2House: 's',
			user3House: 'w',
			user4House: 'n',
			...preset,
		});
	}

	it('renchan on dealer tsumo keeps seats and kyoku and increments honba', () => {
		const engine = new MasterGameEngine(createRenchanState({ honba: 0, kyotaku: 2 }));
		const result = engine.commit_nextKyoku('e', []);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('e');
		expect(engine.$state.kyoku).toBe(1);
		expect(engine.$state.user1House).toBe('e');
		expect(engine.$state.user2House).toBe('s');
		expect(engine.$state.user3House).toBe('w');
		expect(engine.$state.user4House).toBe('n');
		expect(engine.$state.honba).toBe(1);
		expect(engine.$state.kyotaku).toBe(2);
		expect(engine.$state.points).toEqual({
			e: 30000,
			s: 25000,
			w: 20000,
			n: 15000,
		});
	});

	it('oya-nagare on child ron rotates seats, advances kyoku and resets honba', () => {
		const engine = new MasterGameEngine(createRenchanState({ honba: 2, kyotaku: 1 }));
		const result = engine.commit_nextKyoku('s', []);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('e');
		expect(engine.$state.kyoku).toBe(2);
		expect(engine.$state.user1House).toBe('s');
		expect(engine.$state.user2House).toBe('w');
		expect(engine.$state.user3House).toBe('n');
		expect(engine.$state.user4House).toBe('e');
		expect(engine.$state.honba).toBe(0);
		expect(engine.$state.kyotaku).toBe(1);
		expect(engine.$state.points).toEqual({
			e: 15000,
			s: 30000,
			w: 25000,
			n: 20000,
		});
	});

	it('renchan on ryuukyoku with dealer tenpai keeps honba incremented by ryuukyoku', () => {
		const engine = new MasterGameEngine(createRenchanState({ honba: 3, kyotaku: 1 }));
		const result = engine.commit_nextKyoku(null, ['e', 's']);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.kyoku).toBe(1);
		expect(engine.$state.user1House).toBe('e');
		expect(engine.$state.honba).toBe(3);
		expect(engine.$state.kyotaku).toBe(1);
	});

	it('oya-nagare on ryuukyoku without dealer tenpai rotates seats and resets honba', () => {
		const engine = new MasterGameEngine(createRenchanState({ honba: 3, kyotaku: 1 }));
		const result = engine.commit_nextKyoku(null, ['s']);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.kyoku).toBe(2);
		expect(engine.$state.user1House).toBe('s');
		expect(engine.$state.honba).toBe(0);
		expect(engine.$state.kyotaku).toBe(1);
		expect(engine.$state.points).toEqual({
			e: 15000,
			s: 30000,
			w: 25000,
			n: 20000,
		});
	});

	it('advances to south round on oya-nagare from east 4', () => {
		const engine = new MasterGameEngine(createRenchanState({ round: 'e', kyoku: 4, honba: 1, kyotaku: 0 }));
		const result = engine.commit_nextKyoku('s', []);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('s');
		expect(engine.$state.kyoku).toBe(1);
		expect(engine.$state.user1House).toBe('s');
		expect(engine.$state.honba).toBe(0);
	});

	it('ends the game on oya-nagare from south 4', () => {
		const engine = new MasterGameEngine(createRenchanState({ round: 's', kyoku: 4, honba: 0 }));
		const result = engine.commit_nextKyoku('s', []);

		expect(result).toEqual({ ended: true });
	});

	it('detects tobi when any player has no points left', () => {
		expect(isTobiPoints({ e: 0, s: 25000, w: 20000, n: 15000 })).toBe(true);
		expect(isTobiPoints({ e: 30000, s: -100, w: 20000, n: 15000 })).toBe(true);
		expect(isTobiPoints({ e: 30000, s: 25000, w: 20000, n: 15000 })).toBe(false);
	});
});

describe('Master game engine match length', () => {
	function createMatchState(preset: Partial<MasterState> = {}): MasterState {
		return MasterGameEngine.createInitialState({
			round: 'e',
			kyoku: 4,
			honba: 0,
			kyotaku: 0,
			...preset,
		});
	}

	it('defaults to south match', () => {
		expect(MasterGameEngine.createInitialState().matchLength).toBe('south');
	});

	it('falls back to south match for old saves without matchLength', () => {
		const raw = createMatchState() as unknown as Record<string, unknown>;
		delete raw.matchLength;
		const engine = new MasterGameEngine(raw as unknown as MasterState);
		expect(engine.$state.matchLength).toBe('south');
		// 東南戦扱いのため東4局の親流れで南入する
		const result = engine.commit_nextKyoku('s', []);
		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('s');
		expect(engine.$state.kyoku).toBe(1);
	});

	it('enters south round on oya-nagare from east 4 in south match', () => {
		const engine = new MasterGameEngine(createMatchState({ matchLength: 'south' }));
		const result = engine.commit_nextKyoku('s', []);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('s');
		expect(engine.$state.kyoku).toBe(1);
		expect(engine.$state.matchLength).toBe('south');
	});

	it('ends the game on oya-nagare from east 4 in east match without entering south', () => {
		const engine = new MasterGameEngine(createMatchState({ matchLength: 'east' }));
		const result = engine.commit_nextKyoku('s', []);

		expect(result).toEqual({ ended: true });
		expect(engine.$state.round).toBe('e');
		expect(engine.$state.kyoku).toBe(4);
	});

	it('keeps east match through renchan at east 4', () => {
		const engine = new MasterGameEngine(createMatchState({ matchLength: 'east', honba: 0, kyotaku: 1 }));
		const result = engine.commit_nextKyoku('e', []);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('e');
		expect(engine.$state.kyoku).toBe(4);
		expect(engine.$state.matchLength).toBe('east');
		expect(engine.$state.honba).toBe(1);
		expect(engine.$state.kyotaku).toBe(1);
	});

	it('keeps east match on normal advancement before east 4', () => {
		const engine = new MasterGameEngine(createMatchState({ matchLength: 'east', round: 'e', kyoku: 1 }));
		const result = engine.commit_nextKyoku('s', []);

		expect(result).toEqual({ ended: false });
		expect(engine.$state.round).toBe('e');
		expect(engine.$state.kyoku).toBe(2);
		expect(engine.$state.matchLength).toBe('east');
	});
});

describe('Master game engine furiten', () => {
	// e: m123 p345 s678 p78 s22 の p9 待ち (ロンすればピンフ)
	const E_TENPAI: TileId[] = [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78];

	function createMissState(riichi: boolean): MasterState {
		return MasterGameEngine.createInitialState({
			handTiles: {
				e: [...E_TENPAI],
				s: [14, 18, 22, 26, 34, 50, 54, 66, 110, 114, 126, 130, 71],
				w: [70, 15, 19, 23, 27, 35, 39, 43, 51, 55, 67, 111, 115],
				n: [16, 20, 24, 28, 36, 40, 47, 52, 56, 68, 112, 116, 128],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: {
				ron: { callee: 's', callers: ['e'] },
				pon: null,
				cii: null,
				kan: null,
			},
			riichis: { e: riichi, s: false, w: false, n: false },
			tiles: [33, 36, 134, 37, 34],
			kingTiles: [125],
			turn: null,
			nextTurnAfterAsking: 'w',
		});
	}

	it('marks doujun furiten on a missed ron and blocks ron in the same turn', () => {
		const engine = new MasterGameEngine(createMissState(false));
		const res = engine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: false, ron: [] });
		expect(res.type).toBe('tsumo');
		expect(engine.$state.furitenFlags.e).toBe(true);
		expect(engine.$state.riichiFuritenFlags.e).toBe(false);

		// 同巡: w の p9 打牌に e はロンできない
		const res2 = engine.commit_dahai('w', 70);
		expect(res2.asking).toBe(false);
		expect(engine.$state.askings.ron).toBeNull();
	});

	it('clears doujun furiten on own tsumo', () => {
		const engine = new MasterGameEngine(createMissState(false));
		engine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: false, ron: [] });
		engine.commit_dahai('w', 70); // 同巡はロン不可
		expect(engine.$state.askings.ron).toBeNull();

		engine.commit_dahai('n', 112); // n 打牌 → e ツモで同巡解消
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.furitenFlags.e).toBe(false);

		engine.commit_dahai('e', engine.$state.drawnTile!); // ツモ切り
		const res = engine.commit_dahai('s', 71); // s の p9 に e がロンできる
		expect(res.asking).toBe(true);
		if (res.asking) {
			expect(res.canRonHouses).toContain('e');
		}
	});

	it('keeps riichi furiten after own tsumo', () => {
		const engine = new MasterGameEngine(createMissState(true));
		engine.commit_resolveCallingInterruption({ pon: false, cii: false, kan: false, ron: [] });
		expect(engine.$state.furitenFlags.e).toBe(true);
		expect(engine.$state.riichiFuritenFlags.e).toBe(true);

		engine.commit_dahai('w', 115);
		engine.commit_dahai('n', 112); // e ツモ
		expect(engine.$state.furitenFlags.e).toBe(false);
		expect(engine.$state.riichiFuritenFlags.e).toBe(true);

		engine.commit_dahai('e', engine.$state.drawnTile!);
		const res = engine.commit_dahai('s', 71);
		expect(res.asking).toBe(false); // リーチ後見逃しのためロン不可
		expect(engine.$state.askings.ron).toBeNull();
	});
});

describe('Master game engine calling competition', () => {
	// 同一牌に2家がポンできる状態は実牌では起きない（5枚必要）が、
	// 解決ロジックのツモ順優先を検証するため asking を直接構成する。
	it('picks the tsumo-priority house when two houses claim pon', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				// m5 を2枚持ち、ポンできる
				s: [18, 19, 1, 5, 9, 13, 21, 25, 29, 33, 37, 41, 45],
				w: [20, 2, 6, 10, 14, 22, 26, 30, 34, 38, 42, 46, 50],
				n: [],
			},
			hoTiles: { e: [17], s: [], w: [], n: [] },
			askings: {
				ron: null,
				// 列挙順ではなくツモ順（e の下家 s が先）で勝つこと
				pon: { callee: 'e', callers: ['w', 's'] },
				cii: null,
				kan: null,
			},
			tiles: [100, 104],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
		}));

		// 両者とも canPon が見える
		expect(engine.createPlayerState(2).canPon).toEqual({ callee: 'e' });
		expect(engine.createPlayerState(3).canPon).toEqual({ callee: 'e' });

		const res = engine.commit_resolveCallingInterruption({
			pon: { e: null, s: true, w: true, n: null },
			cii: false,
			kan: { e: null, s: null, w: null, n: null },
			ron: [],
		});
		expect(res.type).toBe('ponned');
		if (res.type !== 'ponned') throw new Error('unexpected result');
		expect(res.caller).toBe('s');
		expect(res.callee).toBe('e');
	});

	it('prefers ron over pon', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				// m123 p345 s678 p78 s22 の p9 待ち（ロンすればピンフ）
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [14, 18, 22, 26, 34, 50, 54, 66, 110, 114, 126, 130, 71],
				// p9 を2枚持ち、ポンできる
				w: [70, 72, 2, 6, 10, 15, 19, 23, 27, 35, 39, 43, 51],
				n: [],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: {
				ron: { callee: 's', callers: ['e'] },
				pon: { callee: 's', callers: ['w'] },
				cii: null,
				kan: null,
			},
			riichis: { e: false, s: false, w: false, n: false },
			tiles: [33, 36],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 'w',
		}));

		const res = engine.commit_resolveCallingInterruption({
			pon: { e: null, s: null, w: true, n: null },
			cii: false,
			kan: { e: null, s: null, w: null, n: null },
			ron: ['e'],
		}, false);
		expect(res.type).toBe('ronned');
		if (res.type !== 'ronned') throw new Error('unexpected result');
		expect(res.callers).toEqual(['e']);
	});

	it('prefers kan over pon', () => {
		// ポン対カンの発声順優先は単純化として kan 優先に固定する。
		// 同一牌へのポンとカンの両立は実牌では起きないため asking を直接構成する。
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				// m5 を3枚持ち、カンできる
				s: [18, 19, 20, 1, 5, 9, 13, 21, 25, 29, 33, 37, 41],
				// ポン主張者（ツモ順では s より後ろのため負ける）
				w: [2, 6, 10, 14, 22, 26, 30, 34, 38, 42, 46, 50, 54],
				n: [],
			},
			hoTiles: { e: [17], s: [], w: [], n: [] },
			askings: {
				ron: null,
				pon: { callee: 'e', callers: ['w'] },
				cii: null,
				kan: { callee: 'e', callers: ['s'] },
			},
			tiles: [100, 104],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
		}));

		const res = engine.commit_resolveCallingInterruption({
			pon: { e: null, s: null, w: true, n: null },
			cii: false,
			kan: { e: null, s: true, w: null, n: null },
			ron: [],
		});
		expect(res.type).toBe('kanned');
		if (res.type !== 'kanned') throw new Error('unexpected result');
		expect(res.caller).toBe('s');
	});

	it('advances to tsumo when everyone declines', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [14, 18, 22, 26, 34, 50, 54, 66, 110, 114, 126, 130, 71],
				w: [70, 72, 2, 6, 10, 15, 19, 23, 27, 35, 39, 43, 51],
				n: [],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: {
				ron: { callee: 's', callers: ['e'] },
				pon: { callee: 's', callers: ['w'] },
				cii: null,
				kan: null,
			},
			riichis: { e: false, s: false, w: false, n: false },
			tiles: [100, 104],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 'w',
		}));

		const res = engine.commit_resolveCallingInterruption({
			pon: { e: null, s: null, w: false, n: null },
			cii: false,
			kan: { e: null, s: null, w: null, n: null },
			ron: [],
		});
		expect(res.type).toBe('tsumo');
		if (res.type !== 'tsumo') throw new Error('unexpected result');
		expect(res.house).toBe('w');
		expect(engine.$state.turn).toBe('w');
		expect(engine.$state.hoTiles.s).toEqual([69]);
	});

	it('asks pon when holding three of a kind and leaves one tile after the pon', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [17, 1, 5, 9, 13, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				// m5 を3枚持ち (4枚目の m5 が捨てられる)
				s: [18, 19, 20, 2, 6, 10, 14, 22, 26, 30, 34, 38, 42],
				w: [3, 7, 11, 15, 23, 27, 31, 35, 39, 43, 47, 51, 55],
				n: [4, 8, 12, 16, 24, 28, 32, 36, 40, 44, 48, 52, 56],
			},
			tiles: [100, 104],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		const res = engine.commit_dahai('e', 17);
		expect(res.asking).toBe(true);
		if (res.asking !== true) throw new Error('unexpected result');
		expect(res.canPonHouses).toContain('s');
		expect(engine.createPlayerState(2).canPon).toEqual({ callee: 'e' });

		const resolved = engine.commit_resolveCallingInterruption({
			pon: { e: null, s: true, w: null, n: null },
			cii: false,
			kan: { e: null, s: false, w: null, n: null },
			ron: [],
		});
		expect(resolved.type).toBe('ponned');
		if (resolved.type !== 'ponned') throw new Error('unexpected result');
		expect(resolved.caller).toBe('s');
		expect(resolved.callee).toBe('e');
		// ポンは2枚だけ消費し、同種1枚が手牌に残る
		expect(engine.$state.handTiles.s).toHaveLength(11);
		expect(engine.$state.handTiles.s.map(id => Common.findTileByIdOrFail(id).t).filter(t => t === 'm5')).toHaveLength(1);
		expect(engine.$state.huros.s).toHaveLength(1);
		expect(engine.$state.huros.s[0].type).toBe('pon');
	});
});

describe('Master game engine kakan ron (chankan)', () => {
	// e が p9 のポン (69,70,71) + 72 で加槓し、s が p9 待ち (ピンフ) で構える
	function createKakanRonState(): MasterState {
		return MasterGameEngine.createInitialState({
			handTiles: {
				e: [13, 17, 21, 25, 29, 33, 37, 41, 109, 121, 72],
				// m123 p345 s678 p78 s22 の p9 待ち
				s: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [69, 70, 71], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [34, 35],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		});
	}

	it('holds ron asking on kakan instead of immediate rinshan', () => {
		const engine = new MasterGameEngine(createKakanRonState());

		const res = engine.commit_kakan('e', 72);
		expect(res.asking).toBe(true);
		if (!('asking' in res) || !res.asking) throw new Error('unexpected result');
		expect(res.canRonHouses).toContain('s');
		expect(engine.$state.askings.ron).toEqual({ callee: 'e', callers: ['s'] });
		expect(engine.$state.turn).toBeNull();
		expect(engine.$state.nextTurnAfterAsking).toBe('e');
		// 嶺上ツモはまだ行われない
		expect(engine.$state.handTiles.e).not.toContain(34);
		expect(engine.$state.drawnTile).toBeNull();
		// ポンはミンカンに置換され、ドラ表示は宣言時に増える
		expect(engine.$state.huros.e).toHaveLength(1);
		expect(engine.$state.huros.e[0]).toEqual({
			type: 'minkan',
			tiles: [72, 69, 70, 71],
			from: 's',
			kakan: true,
		});
		expect(engine.$state.activatedDorasCount).toBe(2);
		expect(engine.$state.kakanRon).toEqual({ house: 'e', tile: 'p9', tileId: 72 });
	});

	it('does immediate rinshan without asking when no house can ron the kakan tile', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [13, 17, 21, 25, 29, 33, 37, 41, 109, 121, 72],
				// バラバラのノーテン手牌 (p9 を足しても和了形にならない)
				s: [14, 18, 22, 26, 34, 38, 42, 50, 54, 66, 110, 114, 126],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [69, 70, 71], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [34, 35],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		const res = engine.commit_kakan('e', 72);
		expect(res.asking).toBe(false);
		if (!('rinsyan' in res)) throw new Error('unexpected result');
		expect(res.tiles).toEqual([72, 69, 70, 71]);
		expect(res.from).toBe('s');
		expect(engine.$state.askings.ron).toBeNull();
		expect(engine.$state.kakanRon).toBeNull();
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.handTiles.e).toContain(125);
		expect(engine.$state.drawnTile).toBe(125);
		// ドラ表示は宣言時に1回だけ増える
		expect(engine.$state.activatedDorasCount).toBe(2);
	});

	it('does rinshan tsumo and continues the turn when everyone declines kakan ron', () => {
		const engine = new MasterGameEngine(createKakanRonState());

		engine.commit_kakan('e', 72);
		const resolved = engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: [],
		});
		expect(resolved.type).toBe('kakanRinshan');
		if (resolved.type !== 'kakanRinshan') throw new Error('unexpected result');
		expect(resolved.house).toBe('e');
		expect(resolved.rinsyan).toBe(125);
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.handTiles.e).toContain(125);
		expect(engine.$state.drawnTile).toBe(125);
		expect(engine.$state.kakanRon).toBeNull();
		expect(engine.$state.askings.ron).toBeNull();
	});

	it('resolves chankan ron with the kakan house as the discarder', () => {
		const engine = new MasterGameEngine(createKakanRonState());
		engine.$state.kingTiles[0] = 125;

		engine.commit_kakan('e', 72);
		const resolved = engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: ['s'],
		}, false);
		expect(resolved.type).toBe('ronned');
		if (resolved.type !== 'ronned') throw new Error('unexpected result');
		expect(resolved.callers).toEqual(['s']);
		expect(resolved.callee).toBe('e');
		expect(resolved.yakus?.s?.yakuNames).toContain('chankan');
		expect(engine.$state.turn).toBeNull();
		expect(engine.$state.kakanRon).toBeNull();
	});
});

describe('Master game engine ura dora', () => {
	it('adds ura dora on a riichi tsumo', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			...new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 'm3'])
				.build(),
			riichis: { e: true, s: false, w: false, n: false },
			firstTurnFlags: { e: false, s: false, w: false, n: false },
		}));
		engine.$state.kingTiles[0] = 125; // 白表示 → 表ドラは發(手牌になし)
		engine.$state.kingTiles[7] = 117; // 西表示 → 裏ドラは北(手牌に3枚)
		expect(engine.uraDoraIndicateTiles).toEqual([117]);
		expect(engine.uraDoras).toEqual(['n']);
		expect(engine.commit_tsumoHora('e', false).yakus.yakuNames).toEqual(['tsumo', 'riichi']);
		// 2飜 + 裏ドラ3 = 5飜で満貫 (12000)
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 12000,
			s: INITIAL_POINT - 4000,
			w: INITIAL_POINT - 4000,
			n: INITIAL_POINT - 4000,
		});
	});

	it('ignores ura dora without riichi', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			...new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 'm3'])
				.build(),
			firstTurnFlags: { e: false, s: false, w: false, n: false },
		}));
		engine.$state.kingTiles[0] = 125; // 白表示 → 表ドラは發(手牌になし)
		engine.$state.kingTiles[7] = 117; // 西表示 → 裏ドラは北だが非リーチのため加算なし
		expect(engine.commit_tsumoHora('e', false).yakus.yakuNames).toEqual(['tsumo']);
		expect(engine.$state.points).toEqual({
			e: INITIAL_POINT + 2100,
			s: INITIAL_POINT - 700,
			w: INITIAL_POINT - 700,
			n: INITIAL_POINT - 700,
		});
	});
});

describe('Master game engine rinshan from the dead wall', () => {
	it('takes the rinshan tile from the king-tile tail without consuming the living wall', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 2, 3, 4, 5, 9, 13, 17, 21, 25, 29, 33, 37],
				s: [],
				w: [],
				n: [],
			},
			tiles: [38, 39, 40],
			kingTiles: [125, 121, 122, 123],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		const tilesBefore = [...engine.$state.tiles];

		const res = engine.commit_ankan('e', 1);

		// 初回嶺上は王牌末尾
		expect(res.rinsyan).toBe(123);
		expect(engine.$state.drawnTile).toBe(123);
		// 生き壁は減らない
		expect(engine.$state.tiles).toEqual(tilesBefore);
		expect(engine.$state.activatedDorasCount).toBe(2);
	});

	it('takes consecutive rinshan tiles toward the front of the king-tile tail', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 17, 21, 25],
				s: [],
				w: [],
				n: [],
			},
			tiles: [37, 38],
			kingTiles: [125, 121, 33, 34, 35, 36],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		const first = engine.commit_ankan('e', 1);
		expect(first.rinsyan).toBe(36);
		expect(engine.$state.tiles).toEqual([37, 38]);
		expect(engine.doraIndicateTiles).toEqual([125, 121]);

		const second = engine.commit_ankan('e', 5);
		expect(second.rinsyan).toBe(35);
		expect(engine.$state.tiles).toEqual([37, 38]);
		expect(engine.doraIndicateTiles).toEqual([125, 121, 33]);
		expect(engine.$state.activatedDorasCount).toBe(3);
	});

	it('still takes rinshan when the living wall is exhausted', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 2, 3, 4, 5, 9, 13, 17, 21, 25, 29, 33, 37],
				s: [],
				w: [],
				n: [],
			},
			tiles: [],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		const res = engine.commit_ankan('e', 1);

		expect(res.rinsyan).toBe(125);
		expect(engine.$state.drawnTile).toBe(125);
		expect(engine.$state.tiles).toEqual([]);
	});
});

describe('Master game engine abortive draws', () => {
	function expectAbortiveDraw(fn: () => unknown, kind: AbortiveDrawKind, engine: MasterGameEngine): void {
		const before = structuredClone(engine.$state);
		try {
			fn();
		} catch (err) {
			expect(err).toBeInstanceOf(AbortiveDrawError);
			expect((err as AbortiveDrawError).kind).toBe(kind);
			// 例外時は $commit 前のため state は無変更のまま残る
			expect(engine.$state).toEqual(before);
			return;
		}
		throw new Error(`expected AbortiveDrawError(${kind})`);
	}

	it('detects kyushu-kyuhai in the dealer initial hand', () => {
		const kyushu = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 33, 37, 69, 73, 105, 109, 113, 117, 121, 125, 129, 133, 5],
				s: [],
				w: [],
				n: [],
			},
		}));
		let kind: AbortiveDrawKind | null = null;
		try {
			kyushu.assertKyushuKyuhai();
		} catch (err) {
			expect(err).toBeInstanceOf(AbortiveDrawError);
			kind = (err as AbortiveDrawError).kind;
		}
		expect(kind).toBe('kyushukyuhai');
	});

	it('does not flag a normal dealer hand as kyushu-kyuhai', () => {
		const normal = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				s: [],
				w: [],
				n: [],
			},
		}));
		expect(() => normal.assertKyushuKyuhai()).not.toThrow();
	});

	it('aborts on kyushu-kyuhai at the first tsumo', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [42, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 46, 50, 54],
				s: [1, 33, 37, 69, 73, 105, 109, 113, 13, 17, 21, 25, 29],
				w: [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51],
				n: [4, 8, 12, 16, 24, 28, 32, 36, 40, 44, 48, 52, 56],
			},
			tiles: [100, 117],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		// s の第一ツモ(117 で幺九牌9種)で中斷する
		expectAbortiveDraw(() => engine.commit_dahai('e', 42), 'kyushukyuhai', engine);
	});

	it('aborts on four winds discard', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [13, 17, 21, 25, 33, 37, 41, 45, 49, 53, 65, 125, 129, 109],
				s: [14, 18, 22, 26, 34, 38, 42, 46, 50, 54, 66, 126, 110],
				w: [15, 19, 23, 27, 35, 39, 43, 47, 51, 55, 67, 127, 111],
				n: [16, 20, 24, 28, 36, 40, 44, 48, 52, 56, 68, 128, 112],
			},
			turn: 'e',
		}));
		engine.commit_dahai('e', 109);
		engine.commit_dahai('s', 110);
		engine.commit_dahai('w', 111);
		// 4枚目の同風牌打牌で中斷する
		expectAbortiveDraw(() => engine.commit_dahai('n', 112), 'suufonrenda', engine);
	});

	it('does not abort on four discards of a non-wind tile', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [13, 17, 21, 25, 33, 37, 41, 45, 49, 53, 65, 125, 129, 1],
				s: [14, 18, 22, 26, 34, 38, 42, 46, 50, 54, 66, 126, 2],
				w: [15, 19, 23, 27, 35, 39, 43, 47, 51, 55, 67, 127, 3],
				n: [16, 20, 24, 28, 36, 40, 44, 48, 52, 56, 68, 128, 4],
			},
			turn: 'e',
		}));
		engine.commit_dahai('e', 1);
		engine.commit_dahai('s', 2);
		engine.commit_dahai('w', 3);
		// 同種でも風牌でなければ四風連打にならない
		engine.commit_dahai('n', 4);
		expect(engine.$state.hoTiles).toEqual({ e: [1], s: [2], w: [3], n: [4] });
	});

	it('aborts on the fourth riichi', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10, 113],
				s: [2, 6, 11, 60, 61, 62, 94, 98, 102, 124, 125, 126, 12, 114],
				w: [3, 7, 13, 63, 64, 65, 95, 99, 103, 127, 128, 129, 14, 115],
				n: [4, 8, 15, 66, 67, 68, 96, 100, 104, 130, 131, 132, 16, 116],
			},
			riichis: { e: true, s: true, w: true, n: false },
			turn: 'n',
		}));
		const pointsBefore = { ...engine.$state.points };
		expectAbortiveDraw(() => engine.commit_dahai('n', 116, true), 'suuchariichi', engine);
		expect(engine.$state.points).toEqual(pointsBefore);
		expect(engine.$state.kyotaku).toBe(0);
	});

	it('aborts on triple ron before scoring', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [],
				w: [2, 6, 11, 46, 50, 54, 94, 98, 102, 62, 66, 79, 80],
				n: [3, 7, 13, 47, 51, 55, 95, 99, 103, 63, 67, 81, 82],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: { ron: { callee: 's', callers: ['e', 'w', 'n'] }, pon: null, cii: null, kan: null },
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 'w',
			honba: 1,
			kyotaku: 2,
		}));
		const pointsBefore = { ...engine.$state.points };
		expectAbortiveDraw(() => engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: ['e', 'w', 'n'],
		}, false), 'sanchaho', engine);
		expect(engine.$state.points).toEqual(pointsBefore);
	});

	it('aborts on the fourth kan across houses on ankan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				s: [],
				w: [],
				n: [9, 10, 11, 12, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49],
			},
			huros: {
				e: [{ type: 'ankan', tiles: [1, 2, 3, 4] }],
				s: [{ type: 'ankan', tiles: [5, 6, 7, 8] }],
				w: [{ type: 'minkan', tiles: [17, 18, 19, 20], from: 'e' }],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'n',
		}));
		expectAbortiveDraw(() => engine.commit_ankan('n', 9), 'suukaikan', engine);
		expect(engine.$state.huros.n).toEqual([]);
	});

	it('aborts on the fourth kan across houses on kakan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [13, 17, 21, 25, 29, 33, 37, 41, 109, 121, 20],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [{ type: 'ankan', tiles: [1, 2, 3, 4] }],
				w: [{ type: 'ankan', tiles: [5, 6, 7, 8] }],
				n: [{ type: 'ankan', tiles: [9, 10, 11, 12] }],
			},
			tiles: [34, 35],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		expectAbortiveDraw(() => engine.commit_kakan('e', 20), 'suukaikan', engine);
		expect(engine.$state.huros.e).toEqual([{ type: 'pon', tiles: [17, 18, 19], from: 's' }]);
		expect(engine.$state.askings.ron).toBeNull();
	});

	it('aborts on the fourth kan across houses on daiminkan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				s: [18, 19, 20, 13, 21, 25, 29, 33, 37, 41, 45, 49, 53],
				w: [],
				n: [],
			},
			hoTiles: { e: [17], s: [], w: [], n: [] },
			huros: {
				e: [{ type: 'ankan', tiles: [1, 2, 3, 4] }],
				s: [],
				w: [{ type: 'ankan', tiles: [5, 6, 7, 8] }],
				n: [{ type: 'ankan', tiles: [9, 10, 11, 12] }],
			},
			askings: {
				ron: null,
				pon: null,
				cii: null,
				kan: { callee: 'e', callers: ['s'] },
			},
			tiles: [100, 104],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
		}));
		expectAbortiveDraw(() => engine.commit_resolveCallingInterruption({
			pon: { e: null, s: null, w: null, n: null },
			cii: false,
			kan: { e: null, s: true, w: null, n: null },
			ron: [],
		}), 'suukaikan', engine);
	});

	it('continues when the same house kans four times', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [9, 10, 11, 12, 13, 17, 21, 25, 29, 33, 37, 41, 45],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [
					{ type: 'ankan', tiles: [1, 2, 3, 4] },
					{ type: 'ankan', tiles: [5, 6, 7, 8] },
					{ type: 'minkan', tiles: [17, 18, 19, 20], from: 's', kakan: true },
				],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125, 121, 122, 123],
			activatedDorasCount: 4,
			turn: 'e',
		}));
		const res = engine.commit_ankan('e', 9);
		expect(engine.$state.huros.e).toHaveLength(4);
		// 5つ目のカン表示に対応する嶺上牌は王牌先頭
		expect(res.rinsyan).toBe(125);
	});

	it('rejects the fifth kan with a normal error', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				s: [9, 10, 11, 12, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49],
				w: [],
				n: [],
			},
			huros: {
				e: [
					{ type: 'ankan', tiles: [1, 2, 3, 4] },
					{ type: 'ankan', tiles: [5, 6, 7, 8] },
					{ type: 'minkan', tiles: [17, 18, 19, 20], from: 's' },
					{ type: 'minkan', tiles: [69, 70, 71, 72], from: 'w' },
				],
				s: [],
				w: [],
				n: [],
			},
			tiles: [33, 34],
			kingTiles: [125, 121, 122, 123],
			activatedDorasCount: 4,
			turn: 's',
		}));
		const before = structuredClone(engine.$state);
		try {
			engine.commit_ankan('s', 9);
		} catch (err) {
			expect(err).not.toBeInstanceOf(AbortiveDrawError);
			expect((err as Error).message).toBe('Too many kans');
			expect(engine.$state).toEqual(before);
			return;
		}
		throw new Error('expected Too many kans');
	});

	it('commit_abortiveDraw only increments honba', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			honba: 2,
			kyotaku: 3,
			askings: {
				ron: { callee: 's', callers: ['e', 'w', 'n'] },
				pon: null,
				cii: null,
				kan: null,
			},
			kakanRon: { house: 'e', tile: 'p9', tileId: 72 },
			turn: null,
			nextTurnAfterAsking: 'w',
		}));
		const pointsBefore = { ...engine.$state.points };
		const result = engine.commit_abortiveDraw('sanchaho');
		expect(result).toEqual({
			tenpaiHouses: [],
			notenHouses: ['e', 's', 'w', 'n'],
			pointDeltas: { e: 0, s: 0, w: 0, n: 0 },
			abortive: 'sanchaho',
		});
		expect(engine.$state.honba).toBe(3);
		expect(engine.$state.kyotaku).toBe(3);
		expect(engine.$state.points).toEqual(pointsBefore);
		expect(engine.$state.askings).toEqual({ ron: null, pon: null, cii: null, kan: null });
		expect(engine.$state.kakanRon).toBeNull();
		expect(engine.$state.turn).toBeNull();
	});
});

describe('Master game engine abortive draws review fixes', () => {
	it('does not abort on four winds discard after an ankan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 2, 3, 4, 109, 13, 17, 21, 25, 33, 37, 41, 45, 49],
				s: [14, 18, 22, 26, 34, 38, 42, 46, 50, 54, 66, 126, 110],
				w: [15, 19, 23, 27, 35, 39, 43, 47, 51, 55, 67, 127, 111],
				n: [16, 20, 24, 28, 36, 40, 44, 48, 52, 56, 68, 128, 112],
			},
			tiles: [99, 100, 101, 102],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		engine.commit_ankan('e', 1);
		// 暗槓で全家の first turn が崩れる
		expect(engine.$state.firstTurnFlags).toEqual({ e: false, s: false, w: false, n: false });
		engine.commit_dahai('e', 109);
		engine.commit_dahai('s', 110);
		engine.commit_dahai('w', 111);
		// 四風牌が4枚並んでも中斷せず対局が続く
		engine.commit_dahai('n', 112);
		expect(engine.$state.hoTiles).toEqual({ e: [109], s: [110], w: [111], n: [112] });
		expect(engine.$state.turn).toBe('e');
	});

	it('clears first turn flags on kakan', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [20, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49],
				s: [14, 18, 22, 26, 34, 38, 42, 46, 50, 54, 66, 126, 130],
				w: [15, 19, 23, 27, 35, 39, 43, 47, 51, 55, 67, 127, 131],
				n: [16, 24, 28, 36, 40, 44, 48, 52, 56, 68, 128, 132, 136],
			},
			huros: {
				e: [{ type: 'pon', tiles: [17, 18, 19], from: 's' }],
				s: [],
				w: [],
				n: [],
			},
			tiles: [100],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		engine.commit_kakan('e', 20);
		expect(engine.$state.firstTurnFlags).toEqual({ e: false, s: false, w: false, n: false });
	});

	it('does not abort on triple ron answers including houses without rights', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 45, 49, 53, 93, 97, 101, 61, 65, 77, 78],
				s: [],
				w: [2, 6, 11, 46, 50, 54, 94, 98, 102, 62, 66, 79, 80],
				n: [3, 7, 12, 47, 51, 55, 95, 99, 103, 63, 67, 81, 82],
			},
			hoTiles: { e: [], s: [69], w: [], n: [] },
			askings: { ron: { callee: 's', callers: ['e', 'w'] }, pon: null, cii: null, kan: null },
			tiles: [33, 34],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 'w',
		}));
		// n に権利はないため三家和にならず、通常のロン解決に進む
		const res = engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: ['e', 'w', 'n'],
		}, false);
		expect(res.type).toBe('ronned');
		if (res.type !== 'ronned') throw new Error('unexpected result');
		expect(res.callers).toEqual(['e', 'w', 'n']);
		expect(engine.$state.points.s).toBeLessThan(INITIAL_POINT);
	});

	it('does not offer daiminkan for the fifth kan and continues the game', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [17, 13, 21, 25, 29, 33, 37, 41, 45, 49, 53, 65, 125, 129],
				s: [18, 19, 20, 14, 22, 26, 30, 34, 38, 42, 46, 50, 54],
				w: [15, 23, 27, 35, 39, 43, 47, 51, 55, 67, 127, 113, 114],
				n: [16, 24, 28, 36, 40, 44, 48, 52, 56, 68, 128, 115, 116],
			},
			huros: {
				e: [{ type: 'ankan', tiles: [1, 2, 3, 4] }],
				s: [{ type: 'ankan', tiles: [5, 6, 7, 8] }],
				w: [{ type: 'ankan', tiles: [9, 10, 11, 12] }],
				n: [{ type: 'minkan', tiles: [61, 62, 63, 64], from: 'e' }],
			},
			tiles: [100, 101, 102],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		// 5つ目になる大明槓は asking されない
		const dahai = engine.commit_dahai('e', 17);
		expect(dahai.asking).toBe(true);
		if (!dahai.asking) throw new Error('unexpected result');
		expect(dahai.canKanHouses).toEqual([]);
		// 鳴きを辞退すればツモに進み、局は停止しない
		const resolved = engine.commit_resolveCallingInterruption({
			pon: { e: null, s: false, w: null, n: null },
			cii: false,
			kan: { e: null, s: null, w: null, n: null },
			ron: [],
		});
		expect(resolved.type).toBe('tsumo');
		if (resolved.type !== 'tsumo') throw new Error('unexpected result');
		expect(resolved.house).toBe('s');
		expect(engine.$state.turn).toBe('s');
		expect(engine.$state.tiles).toHaveLength(2);
	});
});

describe('Master game engine renhou', () => {
	function findTileOfType(engine: MasterGameEngine, house: House, tile: TileType): TileId {
		const found = engine.handTiles[house].find(t => Common.TILE_ID_MAP.get(t)!.t === tile);
		if (found == null) throw new Error(`No such tile: ${tile}`);
		return found;
	}

	it('offers renhou ron on the first discard of the kyoku', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'e', 'e', 'e', 'n', 'n'])
				.setHandTiles('s', ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'haku', 'haku', 'haku', 'n'])
				.setHandTiles('w', ['m4', 'm5', 'm6', 'p1', 'p2', 'p3', 's1', 's2', 's3', 's', 's', 's', 'w'])
				.setHandTiles('n', ['m7', 'm8', 'm9', 'p7', 'p8', 'p9', 's4', 's5', 's6', 'w', 'w', 'w', 'chun'])
				.build(),
		));
		const res = engine.commit_dahai('e', findTileOfType(engine, 'e', 'n'));
		expect(res.asking).toBe(true);
		if (!res.asking) throw new Error('unexpected result');
		expect(res.canRonHouses).toEqual(['s']);
		const resolved = engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: ['s'],
		}, false);
		expect(resolved.type).toBe('ronned');
		if (resolved.type !== 'ronned') throw new Error('unexpected result');
		expect(resolved.yakus.s?.yakuNames).toContain('renhou');
	});

	it('does not offer renhou ron after the first discard', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState(
			new TileSetBuilder()
				.setHandTiles('e', ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'e', 'e', 'e', 'n', 'haku'])
				.setHandTiles('s', ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's1', 's2', 's3', 'haku', 'haku', 'chun', 'e'])
				.setHandTiles('w', ['m4', 'm5', 'm7', 'm8', 'p1', 'p2', 'p7', 'p8', 's2', 's5', 's8', 'w', 'haku'])
				.setHandTiles('n', ['m7', 'm8', 'm9', 'p7', 'p8', 'p9', 's4', 's5', 's6', 'n', 'n', 'n', 'chun'])
				.build(),
		));
		// 初打は誰もロンできない (s のポンのみ成立し辞退する)
		const first = engine.commit_dahai('e', findTileOfType(engine, 'e', 'haku'));
		expect(first.asking).toBe(true);
		if (!first.asking) throw new Error('unexpected result');
		expect(first.canRonHouses).toEqual([]);
		engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: [],
		}, false);
		// 2枚目の捨て牌へのロンは人和にならない (自風の役のみ)
		const second = engine.commit_dahai('s', findTileOfType(engine, 's', 'chun'));
		expect(second.asking).toBe(true);
		if (!second.asking) throw new Error('unexpected result');
		expect(second.canRonHouses).toEqual(['n']);
		const resolved = engine.commit_resolveCallingInterruption({
			pon: false,
			cii: false,
			kan: false,
			ron: ['n'],
		}, false);
		expect(resolved.type).toBe('ronned');
		if (resolved.type !== 'ronned') throw new Error('unexpected result');
		expect(resolved.yakus.n?.yakuNames).toContain('seat-wind-n');
		expect(resolved.yakus.n?.yakuNames).not.toContain('renhou');
	});
});

describe('Master game engine nagashimangan', () => {
	it('replaces tenpai payment with yakuman-tsumo payment and renchan on exhaustive draw', () => {
		const hoTileIds: TileId[] = [];
		for (const id of Common.TILE_ID_MAP.keys()) {
			if (hoTileIds.length >= 18) break;
			if (Common.includes(Common.YAOCHU_TILES, Common.TILE_ID_MAP.get(id)!.t)) hoTileIds.push(id);
		}
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			tiles: [],
			honba: 1,
			kyotaku: 2,
			hoTiles: { e: hoTileIds, s: [], w: [], n: [] },
		}));
		const result = engine.commit_ryuukyoku();
		expect(result.nagashiHouses).toEqual(['e']);
		expect(result.tenpaiHouses).toEqual([]);
		// 親の役満ツモ相当 48000/16000 + 本場 + 供託総取り、テンパイ料なし
		expect(result.pointDeltas).toEqual({
			e: 48000 + 300 + 2000,
			s: -16000 - 100,
			w: -16000 - 100,
			n: -16000 - 100,
		});
		expect(engine.$state.honba).toBe(2);
		expect(engine.$state.kyotaku).toBe(0);
		// 親連荘: 既存経路に tenpaiHouses ['e'] で乗せる
		expect(engine.commit_nextKyoku(null, ['e'])).toEqual({ ended: false });
		expect(engine.$state.kyoku).toBe(1);
		expect(engine.$state.honba).toBe(2);
	});
});

describe('Master game engine riichiTiles', () => {
	it('records the discarded tile id on riichi dahai', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10, 33],
				s: [],
				w: [],
				n: [],
			},
			tiles: [34, 35],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		expect(engine.$state.riichiTiles).toEqual({ e: null, s: null, w: null, n: null });

		engine.commit_dahai('e', 33, true);

		expect(engine.$state.riichiTiles.e).toBe(33);
		expect(engine.$state.hoTiles.e.at(-1)).toBe(33);
		expect(engine.createPlayerState(1).riichiTiles.e).toBe(33);
	});

	it('keeps riichiTiles null on non-riichi dahai', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [1, 5, 9, 57, 58, 59, 93, 97, 101, 121, 122, 123, 10, 33],
				s: [],
				w: [],
				n: [],
			},
			tiles: [34, 35],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));

		engine.commit_dahai('e', 33);

		expect(engine.$state.riichiTiles.e).toBeNull();
		expect(engine.$state.hoTiles.e.at(-1)).toBe(33);
	});
});

describe('Master game engine south-1 kyushu-kyuhai recovery', () => {
	it('renchan from south 1 abortive draw reaches a playable next kyoku', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			round: 's',
			kyoku: 1,
			honba: 0,
			kyotaku: 0,
			handTiles: {
				// 親14枚に幺九牌13種 (九種九牌)
				e: [1, 33, 37, 69, 73, 105, 109, 113, 117, 121, 125, 129, 133, 5],
				s: [2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 42, 46, 50],
				w: [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51],
				n: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52],
			},
		}));

		// 南1局の親九種九牌を検出する
		let kind: AbortiveDrawKind | null = null;
		try {
			engine.assertKyushuKyuhai();
		} catch (err) {
			expect(err).toBeInstanceOf(AbortiveDrawError);
			kind = (err as AbortiveDrawError).kind;
		}
		expect(kind).toBe('kyushukyuhai');

		// サービス層相当: abort → 連荘で次局へ
		const abortResult = engine.commit_abortiveDraw('kyushukyuhai');
		expect(abortResult.abortive).toBe('kyushukyuhai');
		expect(engine.$state.honba).toBe(1);
		expect(engine.$state.turn).toBeNull();
		const keyBefore = { round: engine.$state.round, kyoku: engine.$state.kyoku, turnCount: engine.$state.turnCount };

		const next = engine.commit_nextKyoku(null, ['e']);
		expect(next).toEqual({ ended: false });
		// 連荘のため局識別子は不変 (冪等ガードが次局進行を弾かない)
		expect({ round: engine.$state.round, kyoku: engine.$state.kyoku, turnCount: engine.$state.turnCount }).toEqual(keyBefore);
		expect(engine.$state.round).toBe('s');
		expect(engine.$state.kyoku).toBe(1);
		expect(engine.$state.honba).toBe(1);
		// 新局が対局可能 (親番・配牌枚数・ツモ牌)
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.handTiles.e).toHaveLength(14);
		expect(engine.$state.handTiles.s).toHaveLength(13);
		expect(engine.$state.handTiles.w).toHaveLength(13);
		expect(engine.$state.handTiles.n).toHaveLength(13);
		expect(engine.$state.drawnTile).toBe(engine.$state.handTiles.e.at(-1));
	});

	it('first-tsumo kyushu throw via dahai leaves state unchanged and recovers via abortiveDraw', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [42, 2, 6, 10, 14, 18, 22, 26, 30, 34, 38, 46, 50, 54],
				// 幺九牌8種 + 残り壁先頭117(w)で9種になる
				s: [1, 33, 37, 69, 73, 105, 109, 113, 13, 17, 21, 25, 29],
				w: [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51],
				n: [4, 8, 12, 16, 24, 28, 32, 36, 40, 44, 48, 52, 56],
			},
			tiles: [100, 117],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: 'e',
		}));
		const before = structuredClone(engine.$state);

		// s の第一ツモで九種九牌中断。壁・手牌を変更する前に throw する
		let kind: AbortiveDrawKind | null = null;
		try {
			engine.commit_dahai('e', 42);
		} catch (err) {
			expect(err).toBeInstanceOf(AbortiveDrawError);
			kind = (err as AbortiveDrawError).kind;
		}
		expect(kind).toBe('kyushukyuhai');
		// $commit 前のため state は無変更 (turn=null 放置・河残留なし)
		expect(engine.$state).toEqual(before);
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.hoTiles.e).toEqual([]);
		expect(engine.$state.askings).toEqual({ ron: null, pon: null, cii: null, kan: null });

		// サービス層相当の回収: abort で asking なし・turn=null の確定状態にし、連荘で次局へ
		engine.commit_abortiveDraw('kyushukyuhai');
		expect(engine.$state.askings).toEqual({ ron: null, pon: null, cii: null, kan: null });
		expect(engine.$state.turn).toBeNull();
		expect(engine.commit_nextKyoku(null, ['e'])).toEqual({ ended: false });
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.handTiles.e).toHaveLength(14);
	});

	it('declined asking leading to kyushu tsumo throws without stranding and recovers via abortiveDraw', () => {
		const engine = new MasterGameEngine(MasterGameEngine.createInitialState({
			handTiles: {
				e: [],
				// 幺九牌8種 + 残り壁先頭117(w)で9種になる
				s: [1, 33, 37, 69, 73, 105, 109, 113, 13, 17, 21, 25, 29],
				w: [],
				n: [],
			},
			hoTiles: { e: [17], s: [], w: [], n: [] },
			askings: {
				ron: null,
				pon: { callee: 'e', callers: ['s'] },
				cii: null,
				kan: null,
			},
			tiles: [100, 117],
			kingTiles: [125],
			activatedDorasCount: 1,
			turn: null,
			nextTurnAfterAsking: 's',
		}));
		const before = structuredClone(engine.$state);

		// 全辞退 → else 分岐の tsumo() で九種九牌中断
		let kind: AbortiveDrawKind | null = null;
		try {
			engine.commit_resolveCallingInterruption({
				pon: { e: null, s: false, w: null, n: null },
				cii: false,
				kan: { e: null, s: null, w: null, n: null },
				ron: [],
			});
		} catch (err) {
			expect(err).toBeInstanceOf(AbortiveDrawError);
			kind = (err as AbortiveDrawError).kind;
		}
		expect(kind).toBe('kyushukyuhai');
		// $commit 前のため外側 state は無変更 (asking 残留は仕様。サービス層の catch → abortiveDraw で掃除する)
		expect(engine.$state).toEqual(before);
		expect(engine.$state.askings.pon).toEqual({ callee: 'e', callers: ['s'] });
		expect(engine.$state.turn).toBeNull();
		expect(engine.$state.nextTurnAfterAsking).toBe('s');

		// サービス層相当の回収: abort で asking を掃除し、連荘で次局へ
		engine.commit_abortiveDraw('kyushukyuhai');
		expect(engine.$state.askings).toEqual({ ron: null, pon: null, cii: null, kan: null });
		expect(engine.$state.turn).toBeNull();
		expect(engine.commit_nextKyoku(null, ['e'])).toEqual({ ended: false });
		expect(engine.$state.turn).toBe('e');
		expect(engine.$state.handTiles.e).toHaveLength(14);
	});
});
