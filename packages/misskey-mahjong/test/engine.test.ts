/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Common from '../src/common.js';
import { TileType, TileId } from '../src/common.js';
import { MasterGameEngine, MasterState, INITIAL_POINT } from '../src/engine.master.js';

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

		engine.commit_nextKyoku();

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
			tiles: [9, 33], // 嶺上牌(m3), その後ろの牌
			kingTiles: [125], // ドラ表示牌は白。手牌にドラが乗らないようにする
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
		});
		expect(engine.$state.handTiles.e).toHaveLength(11);
		expect(engine.$state.handTiles.e).not.toContain(20);
		expect(engine.$state.handTiles.e).toContain(9);

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

		engine.commit_ankan('e', 1);
		expect(engine.doraIndicateTiles).toEqual([125, 121, 122]);

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
		['pon', { pon: { callee: 'e', caller: 's' }, cii: null, kan: null }],
		['cii', { pon: null, cii: { callee: 'e', caller: 's' }, kan: null }],
		['kan', { pon: null, cii: null, kan: { callee: 'e', caller: 's' } }],
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
		});
	});
});
