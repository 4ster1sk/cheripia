/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { TileType, House, Huro, TileId } from './common.js';
import * as Common from './common.js';
import { PlayerState } from './engine.player.js';
import { calcYakusWithDetail, convertHuroForCalcYaku, getWaitTiles, isAgarikeiWithHuros, YakuData, YakuSet } from './common.yaku.js';
import { calcFu } from './common.fu.js';

export const INITIAL_POINT = 25000;

/**
 * いずれかの持ち点が0以下ならトビ終了とする。
 */
export function isTobiPoints(points: Record<House, number>): boolean {
	return (['e', 's', 'w', 'n'] as const).some(house => points[house] <= 0);
}

//#region syntax suger
function $(tid: TileId): Common.TileInstance {
	return Common.findTileByIdOrFail(tid);
}

function $type(tid: TileId): TileType {
	return $(tid).t;
}
//#endregion

function shuffle<T extends unknown[]>(array: T): T {
	let currentIndex = array.length, randomIndex;

	// While there remain elements to shuffle.
	while (currentIndex > 0) {
		// Pick a remaining element.
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex--;

		// And swap it with the current element.
		[array[currentIndex], array[randomIndex]] = [
			array[randomIndex], array[currentIndex]];
	}

	return array;
}

/**
 * デプロイを跨いで読み込まれた旧形式の asking（pon/kan が { caller } 単数）を
 * 新形式（{ callers } 複数）に寄せる。cii・ron には触れない。
 */
function normalizeAskings(state: MasterState): void {
	for (const key of ['pon', 'kan'] as const) {
		const asking = state.askings[key] as unknown as { callee: House; callers?: House[]; caller?: House } | null;
		if (asking != null && asking.callers == null && asking.caller != null) {
			state.askings[key] = { callee: asking.callee, callers: [asking.caller] };
		}
	}
}

class StateManager {
	public $state: MasterState;
	private commitCallback?: (state: MasterState) => void;

	constructor(state: MasterState, commitCallback?: (state: MasterState) => void) {
		this.$state = structuredClone(state);
		normalizeAskings(this.$state);
		this.commitCallback = commitCallback;
	}

	public $commit() {
		if (this.commitCallback) this.commitCallback(this.$state);
	}

	public get doras(): TileType[] {
		return this.$state.kingTiles.slice(0, this.$state.activatedDorasCount)
			.map(id => Common.nextTileForDora($type(id)));
	}

	public get handTiles(): Record<House, TileId[]> {
		return this.$state.handTiles;
	}

	public get handTileTypes(): Record<House, TileType[]> {
		return {
			e: this.$state.handTiles.e.map(id => $type(id)),
			s: this.$state.handTiles.s.map(id => $type(id)),
			w: this.$state.handTiles.w.map(id => $type(id)),
			n: this.$state.handTiles.n.map(id => $type(id)),
		};
	}

	public get hoTileTypes(): Record<House, TileType[]> {
		return {
			e: this.$state.hoTiles.e.map(id => $type(id)),
			s: this.$state.hoTiles.s.map(id => $type(id)),
			w: this.$state.hoTiles.w.map(id => $type(id)),
			n: this.$state.hoTiles.n.map(id => $type(id)),
		};
	}

	public get riichis(): Record<House, boolean> {
		return this.$state.riichis;
	}

	public get askings(): MasterState['askings'] {
		return this.$state.askings;
	}

	public get user1House(): House {
		return this.$state.user1House;
	}

	public get user2House(): House {
		return this.$state.user2House;
	}

	public get user3House(): House {
		return this.$state.user3House;
	}

	public get user4House(): House {
		return this.$state.user4House;
	}

	public get turn(): House | null {
		return this.$state.turn;
	}

	public getTenpaiHouses(): House[] {
		return (['e', 's', 'w', 'n'] as const).filter(house => {
			const huros = this.$state.huros[house].map(convertHuroForCalcYaku);
			return getWaitTiles(this.handTileTypes[house], huros).length > 0;
		});
	}

	public canRon(house: House, tid: TileId): boolean {
		if (this.$state.furitenFlags?.[house]) return false;
		if (this.$state.riichiFuritenFlags?.[house]) return false;
		// フリテン（自河現物）
		if (this.hoTileTypes[house].includes($type(tid))) return false;

		const huros = this.$state.huros[house].map(convertHuroForCalcYaku);
		if (!isAgarikeiWithHuros(this.handTileTypes[house].concat($type(tid)), huros)) return false; // 完成形じゃない

		const yakus = calcYakusWithDetail({
			seatWind: house,
			fieldWind: this.$state.round,
			handTiles: this.handTileTypes[house].concat($type(tid)),
			huros,
			tsumoTile: null,
			ronTile: $type(tid),
			firstTurn: this.$state.firstTurnFlags[house],
			riichi: this.$state.riichis[house],
			doubleRiichi: this.$state.doubleRiichis[house],
			ippatsu: this.$state.ippatsus[house],
			hotei: this.$state.tiles.length === 0,
		});

		return yakus.yakuNames.length > 0; // 役がない
	}

	public canPon(house: House, tid: TileId): boolean {
		return this.handTileTypes[house].filter(t => t === $type(tid)).length === 2;
	}

	public canDaiminkan(caller: House, tid: TileId): boolean {
		return this.handTileTypes[caller].filter(t => t === $type(tid)).length === 3;
	}

	public canCii(caller: House, callee: House, tid: TileId): boolean {
		if (callee !== Common.prevHouse(caller)) return false;
		const hand = this.handTileTypes[caller];
		return Common.SHUNTU_PATTERNS.some(pattern =>
			pattern.includes($type(tid)) &&
			pattern.filter(t => hand.includes(t) && t !== $type(tid)).length >= 2);
	}

	private withTsumoTile(tile: TileId | undefined, isRinshan: boolean): TileId {
		if (tile == null) throw new Error('No tiles left');
		if (this.$state.turn == null) throw new Error('Not your turn');
		this.$state.handTiles[this.$state.turn].push(tile);
		this.$state.drawnTile = tile;
		this.$state.rinshanFlags[this.$state.turn] = isRinshan;
		if (this.$state.furitenFlags != null) {
			this.$state.furitenFlags[this.$state.turn] = false;
		}
		return tile;
	}

	public tsumo(): TileId {
		return this.withTsumoTile(this.$state.tiles.pop(), false);
	}

	public rinshanTsumo(): TileId {
		return this.withTsumoTile(this.$state.tiles.shift(), true);
	}

	public clearFirstTurnAndIppatsus(): void {
		this.$state.firstTurnFlags.e = false;
		this.$state.firstTurnFlags.s = false;
		this.$state.firstTurnFlags.w = false;
		this.$state.firstTurnFlags.n = false;

		this.$state.ippatsus.e = false;
		this.$state.ippatsus.s = false;
		this.$state.ippatsus.w = false;
		this.$state.ippatsus.n = false;
	}
}

export type MasterState = {
	user1House: House;
	user2House: House;
	user3House: House;
	user4House: House;

	round: 'e' | 's' | 'w' | 'n';
	kyoku: number;
	turnCount: number;
	tiles: TileId[];
	kingTiles: TileId[];
	activatedDorasCount: number;

	/**
	 * 最後に引いた牌 (ツモ牌)
	 */
	drawnTile: TileId | null;

	/**
	 * 副露した牌を含まない手牌
	 */
	handTiles: {
		e: TileId[];
		s: TileId[];
		w: TileId[];
		n: TileId[];
	};

	hoTiles: {
		e: TileId[];
		s: TileId[];
		w: TileId[];
		n: TileId[];
	};
	huros: {
		e: Huro[];
		s: Huro[];
		w: Huro[];
		n: Huro[];
	};
	firstTurnFlags: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	};
	riichis: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	};
	doubleRiichis: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	};
	ippatsus: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	};
	rinshanFlags: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	}
	furitenFlags: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	};
	riichiFuritenFlags: {
		e: boolean;
		s: boolean;
		w: boolean;
		n: boolean;
	};
	points: {
		e: number;
		s: number;
		w: number;
		n: number;
	};
	honba: number;
	kyotaku: number;
	turn: House | null;
	nextTurnAfterAsking: House | null;
	askings: {
		ron: {
			/**
			 * 牌を捨てた人
			 */
			callee: House;

			/**
			 * ロンする権利がある人
			 */
			callers: House[];
		} | null;

		pon: {
			/**
			 * 牌を捨てた人
			 */
			callee: House;

			/**
			 * ポンする権利がある人（ツモ順優先で列挙）
			 */
			callers: House[];
		} | null;

		cii: {
			/**
			 * 牌を捨てた人
			 */
			callee: House;

			/**
			 * チーする権利がある人(calleeの下家なのは自明だがプログラム簡略化のため)
			 */
			caller: House;
		} | null;

		kan: {
			/**
			 * 牌を捨てた人
			 */
			callee: House;

			/**
			 * カンする権利がある人（ツモ順優先で列挙）
			 */
			callers: House[];
		} | null;
	};
};

export class MasterGameEngine {
	private stateManager: StateManager;

	constructor(state: MasterState) {
		this.stateManager = new StateManager(state);
	}

	public get $state() {
		return this.stateManager.$state;
	}

	public get doras(): TileType[] {
		return this.stateManager.doras;
	}

	public get doraIndicateTiles(): TileId[] {
		return this.$state.kingTiles.slice(0, this.$state.activatedDorasCount);
	}

	public get handTiles(): Record<House, TileId[]> {
		return this.stateManager.handTiles;
	}

	public get handTileTypes(): Record<House, TileType[]> {
		return this.stateManager.handTileTypes;
	}

	public get hoTileTypes(): Record<House, TileType[]> {
		return this.stateManager.hoTileTypes;
	}

	public get riichis(): Record<House, boolean> {
		return this.stateManager.riichis;
	}

	public get askings(): MasterState['askings'] {
		return this.stateManager.askings;
	}

	public get user1House(): House {
		return this.stateManager.user1House;
	}

	public get user2House(): House {
		return this.stateManager.user2House;
	}

	public get user3House(): House {
		return this.stateManager.user3House;
	}

	public get user4House(): House {
		return this.stateManager.user4House;
	}

	public get turn(): House | null {
		return this.stateManager.turn;
	}

	public getTenpaiHouses(): House[] {
		return this.stateManager.getTenpaiHouses();
	}

	public commit_ryuukyoku(): {
		tenpaiHouses: House[];
		notenHouses: House[];
		pointDeltas: Record<House, number>;
	} {
		const tx = this.startTransaction();

		const tenpaiHouses = tx.getTenpaiHouses();
		const notenHouses = (['e', 's', 'w', 'n'] as const).filter(house => !tenpaiHouses.includes(house));

		const pointDeltas: Record<House, number> = { e: 0, s: 0, w: 0, n: 0 };
		const tenpaiCount = tenpaiHouses.length;
		if (tenpaiCount > 0 && tenpaiCount < 4) {
			const tenpaiGain = tenpaiCount === 1 ? 3000 : tenpaiCount === 2 ? 1500 : 1000;
			const notenLoss = tenpaiCount === 1 ? 1000 : tenpaiCount === 2 ? 1500 : 3000;
			for (const house of tenpaiHouses) pointDeltas[house] = tenpaiGain;
			for (const house of notenHouses) pointDeltas[house] = -notenLoss;
		}

		tx.$state.points.e += pointDeltas.e;
		tx.$state.points.s += pointDeltas.s;
		tx.$state.points.w += pointDeltas.w;
		tx.$state.points.n += pointDeltas.n;
		tx.$state.honba = (tx.$state.honba ?? 0) + 1;
		tx.$state.turn = null;
		tx.$state.drawnTile = null;

		tx.$commit();

		return {
			tenpaiHouses,
			notenHouses,
			pointDeltas,
		};
	}

	public static createInitialState(preset: Partial<MasterState> = {}): MasterState {
		const ikasama: TileId[] = [125, 129, 9, 56, 57, 61, 77, 81, 85, 133, 134, 135, 121, 122];

		const tiles = shuffle([...Common.TILE_ID_MAP.keys()]);

		//for (const tile of ikasama) {
		//	const index = tiles.indexOf(tile);
		//	tiles.splice(index, 1);
		//}

		const eHandTiles = tiles.splice(0, 14);
		//const eHandTiles = ikasama;
		const sHandTiles = tiles.splice(0, 13);
		const wHandTiles = tiles.splice(0, 13);
		const nHandTiles = tiles.splice(0, 13);
		const kingTiles = tiles.splice(0, 14);

		const state: MasterState = {
			user1House: 'e',
			user2House: 's',
			user3House: 'w',
			user4House: 'n',
			round: 'e',
			kyoku: 1,
			turnCount: 0,
			tiles,
			kingTiles,
			activatedDorasCount: 1,
			drawnTile: eHandTiles.at(-1) ?? null,
			handTiles: {
				e: eHandTiles,
				s: sHandTiles,
				w: wHandTiles,
				n: nHandTiles,
			},
			hoTiles: {
				e: [],
				s: [],
				w: [],
				n: [],
			},
			huros: {
				e: [],
				s: [],
				w: [],
				n: [],
			},
			firstTurnFlags: {
				e: true,
				s: true,
				w: true,
				n: true,
			},
			riichis: {
				e: false,
				s: false,
				w: false,
				n: false,
			},
			doubleRiichis: {
				e: false,
				s: false,
				w: false,
				n: false,
			},
			ippatsus: {
				e: false,
				s: false,
				w: false,
				n: false,
			},
			rinshanFlags: {
				e: false,
				s: false,
				w: false,
				n: false,
			},
			furitenFlags: {
				e: false,
				s: false,
				w: false,
				n: false,
			},
			riichiFuritenFlags: {
				e: false,
				s: false,
				w: false,
				n: false,
			},
			points: {
				e: INITIAL_POINT,
				s: INITIAL_POINT,
				w: INITIAL_POINT,
				n: INITIAL_POINT,
			},
			honba: 0,
			kyotaku: 0,
			turn: 'e',
			nextTurnAfterAsking: null,
			askings: {
				ron: null,
				pon: null,
				cii: null,
				kan: null,
			},
			...preset,
		};

		// preset で手牌が差し替えられた場合も、最後の牌をツモ牌として扱う
		if (preset.drawnTile === undefined) {
			state.drawnTile = state.handTiles.e.at(-1) ?? null;
		}

		return state;
	}

	public getHouse(index: 1 | 2 | 3 | 4): House {
		switch (index) {
			case 1: return this.stateManager.user1House;
			case 2: return this.stateManager.user2House;
			case 3: return this.stateManager.user3House;
			case 4: return this.stateManager.user4House;
		}
	}

	public startTransaction() {
		return new StateManager(this.stateManager.$state, (newState) => {
			this.stateManager = new StateManager(newState);
		});
	}

	public commit_nextKyoku(agariHouse: House | null, tenpaiHouses: House[] = []): { ended: boolean } {
		const tx = this.startTransaction();
		// 連荘判定: 親（席 'e'）の和了、または流局時の親テンパイなら連荘。
		const renchan = agariHouse === 'e' || (agariHouse == null && tenpaiHouses.includes('e'));
		if (renchan) {
			const newState = MasterGameEngine.createInitialState();
			newState.round = tx.$state.round;
			newState.kyoku = tx.$state.kyoku;
			// 点数は席ではなくプレイヤーに紐づくが、席回転しないため写像はそのまま
			newState.points = {
				e: tx.$state.points.e,
				s: tx.$state.points.s,
				w: tx.$state.points.w,
				n: tx.$state.points.n,
			};
			newState.turn = 'e';
			newState.user1House = tx.$state.user1House;
			newState.user2House = tx.$state.user2House;
			newState.user3House = tx.$state.user3House;
			newState.user4House = tx.$state.user4House;
			// 親和了時は +1。流局時は commit_ryuukyoku で既に +1 済みのため加算しない
			newState.honba = agariHouse != null ? (tx.$state.honba ?? 0) + 1 : (tx.$state.honba ?? 0);
			newState.kyotaku = tx.$state.kyotaku ?? 0;
			tx.$state = newState;
			tx.$commit();
			return { ended: false };
		}

		const nextKyoku = tx.$state.kyoku + 1;
		// オーラス止め（和了止め）は実装しない。南4局の親流れは単純終了とする。
		if (nextKyoku > 4) {
			if (tx.$state.round !== 'e') {
				return { ended: true };
			}
			const newState = MasterGameEngine.createInitialState();
			newState.round = 's';
			newState.kyoku = 1;
			newState.points = {
				e: tx.$state.points.n,
				s: tx.$state.points.e,
				w: tx.$state.points.s,
				n: tx.$state.points.w,
			};
			newState.turn = 'e';
			newState.user1House = Common.nextHouse(tx.$state.user1House);
			newState.user2House = Common.nextHouse(tx.$state.user2House);
			newState.user3House = Common.nextHouse(tx.$state.user3House);
			newState.user4House = Common.nextHouse(tx.$state.user4House);
			newState.honba = 0;
			newState.kyotaku = tx.$state.kyotaku ?? 0;
			tx.$state = newState;
			tx.$commit();
			return { ended: false };
		}

		const newState = MasterGameEngine.createInitialState();
		newState.round = tx.$state.round;
		newState.kyoku = nextKyoku;
		// 点数は席風ではなくプレイヤーに紐づくため、席の移動に合わせて回転させる
		newState.points = {
			e: tx.$state.points.n,
			s: tx.$state.points.e,
			w: tx.$state.points.s,
			n: tx.$state.points.w,
		};
		newState.turn = 'e';
		newState.user1House = Common.nextHouse(tx.$state.user1House);
		newState.user2House = Common.nextHouse(tx.$state.user2House);
		newState.user3House = Common.nextHouse(tx.$state.user3House);
		newState.user4House = Common.nextHouse(tx.$state.user4House);
		newState.honba = 0;
		newState.kyotaku = tx.$state.kyotaku ?? 0;
		tx.$state = newState;
		tx.$commit();
		return { ended: false };
	}

	public commit_dahai(house: House, tid: TileId, riichi = false) {
		const tx = this.startTransaction();

		if (tx.$state.turn !== house) throw new Error('Not your turn');

		if (riichi) {
			if (tx.$state.riichis[house]) throw new Error('Already riichi');
			if (tx.$state.huros[house].some(huro => Common.includes(Common.CALL_HURO_TYPES, huro.type))) {
				throw new Error('Cannot riichi with call huros');
			}
			const tempHandTiles = [...tx.handTileTypes[house]];
			tempHandTiles.splice(tempHandTiles.indexOf($type(tid)), 1);
			if (!Common.isTenpai(tempHandTiles)) throw new Error('Not tenpai');
			if (tx.$state.points[house] < 1000) throw new Error('Not enough points');
		}

		const handTiles = tx.$state.handTiles[house];
		if (!handTiles.includes(tid)) throw new Error('No such tile in your hand');
		handTiles.splice(handTiles.indexOf(tid), 1);
		tx.$state.hoTiles[house].push(tid);

		if (tx.$state.riichis[house]) {
			tx.$state.ippatsus[house] = false;
		}

		if (riichi) {
			tx.$state.riichis[house] = true;
			tx.$state.ippatsus[house] = true;
			if (tx.$state.firstTurnFlags[house]) {
				tx.$state.doubleRiichis[house] = true;
			}
			tx.$state.points[house] -= 1000;
			tx.$state.kyotaku = (tx.$state.kyotaku ?? 0) + 1;
		}

		tx.$state.firstTurnFlags[house] = false;
		tx.$state.rinshanFlags[house] = false;
		tx.$state.drawnTile = null;

		const canRonHouses: House[] = [];
		switch (house) {
			case 'e':
				if (tx.canRon('s', tid)) canRonHouses.push('s');
				if (tx.canRon('w', tid)) canRonHouses.push('w');
				if (tx.canRon('n', tid)) canRonHouses.push('n');
				break;
			case 's':
				if (tx.canRon('e', tid)) canRonHouses.push('e');
				if (tx.canRon('w', tid)) canRonHouses.push('w');
				if (tx.canRon('n', tid)) canRonHouses.push('n');
				break;
			case 'w':
				if (tx.canRon('e', tid)) canRonHouses.push('e');
				if (tx.canRon('s', tid)) canRonHouses.push('s');
				if (tx.canRon('n', tid)) canRonHouses.push('n');
				break;
			case 'n':
				if (tx.canRon('e', tid)) canRonHouses.push('e');
				if (tx.canRon('s', tid)) canRonHouses.push('s');
				if (tx.canRon('w', tid)) canRonHouses.push('w');
				break;
		}

		const tsumoPriorityHouses = (callee: House): House[] => {
			const h1 = Common.nextHouse(callee);
			const h2 = Common.nextHouse(h1);
			const h3 = Common.nextHouse(h2);
			return [h1, h2, h3];
		};
		const priority = tsumoPriorityHouses(house);

		const canKanHouses: House[] = priority.filter(h => tx.canDaiminkan(h, tid));

		const canPonHouses: House[] = priority.filter(h => tx.canPon(h, tid));

		let canCiiHouse: House | null = null;
		switch (house) {
			case 'e': canCiiHouse = tx.canCii('s', house, tid) ? 's' : tx.canCii('w', house, tid) ? 'w' : tx.canCii('n', house, tid) ? 'n' : null; break;
			case 's': canCiiHouse = tx.canCii('e', house, tid) ? 'e' : tx.canCii('w', house, tid) ? 'w' : tx.canCii('n', house, tid) ? 'n' : null; break;
			case 'w': canCiiHouse = tx.canCii('e', house, tid) ? 'e' : tx.canCii('s', house, tid) ? 's' : tx.canCii('n', house, tid) ? 'n' : null; break;
			case 'n': canCiiHouse = tx.canCii('e', house, tid) ? 'e' : tx.canCii('s', house, tid) ? 's' : tx.canCii('w', house, tid) ? 'w' : null; break;
		}

		if (canRonHouses.length > 0 || canKanHouses.length > 0 || canPonHouses.length > 0 || canCiiHouse != null) {
			if (canRonHouses.length > 0) {
				tx.$state.askings.ron = {
					callee: house,
					callers: canRonHouses,
				};
			}
			if (canKanHouses.length > 0) {
				tx.$state.askings.kan = {
					callee: house,
					callers: canKanHouses,
				};
			}
			if (canPonHouses.length > 0) {
				tx.$state.askings.pon = {
					callee: house,
					callers: canPonHouses,
				};
			}
			if (canCiiHouse != null) {
				tx.$state.askings.cii = {
					callee: house,
					caller: canCiiHouse,
				};
			}
			tx.$state.turn = null;
			tx.$state.nextTurnAfterAsking = Common.nextHouse(house);
			tx.$commit();

			return {
				asking: true as const,
				canRonHouses: canRonHouses,
				canKanHouses: canKanHouses,
				canPonHouses: canPonHouses,
				canCiiHouse: canCiiHouse,
			};
		}

		// 流局
		if (tx.$state.tiles.length === 0) {
			tx.$state.turn = null;
			tx.$commit();

			return {
				asking: false as const,
				ryuukyoku: true as const,
			};
		}

		tx.$state.turn = Common.nextHouse(house);

		const tsumoTile = tx.tsumo();

		tx.$commit();

		return {
			asking: false as const,
			tsumoTile: tsumoTile,
			next: tx.$state.turn,
		};
	}

	public commit_kakan(house: House, tid: TileId) {
		const tx = this.startTransaction();

		if (tx.$state.turn !== house) throw new Error('Not your turn');
		if (tx.$state.riichis[house]) throw new Error('Cannot kakan during riichi');

		const huros = tx.$state.huros[house];
		const ponIndex = huros.findIndex(h => h.type === 'pon' && $type(h.tiles[0]) === $type(tid));
		if (ponIndex === -1) throw new Error('No such pon');
		const pon = huros[ponIndex] as Huro & { type: 'pon' };

		const handIndex = tx.$state.handTiles[house].indexOf(tid);
		if (handIndex === -1) throw new Error('No such tile in your hand');
		tx.$state.handTiles[house].splice(handIndex, 1);

		const tiles = [tid, ...pon.tiles] as const;
		// 加槓は元のポンをミンカンに置換する (面子数・枚数を増やさない)
		huros[ponIndex] = { type: 'minkan', tiles: tiles, from: pon.from, kakan: true };

		tx.clearFirstTurnAndIppatsus();

		tx.$state.activatedDorasCount++;

		const rinsyan = tx.rinshanTsumo();

		tx.$commit();

		return {
			rinsyan,
			tiles,
			from: pon.from,
		};
	}

	public commit_ankan(house: House, tid: TileId) {
		const tx = this.startTransaction();

		if (tx.$state.turn !== house) throw new Error('Not your turn');

		const t1 = tx.$state.handTiles[house].filter(t => $type(t) === $type(tid)).at(0);
		if (t1 == null) throw new Error('No such tile');
		const t2 = tx.$state.handTiles[house].filter(t => $type(t) === $type(tid)).at(1);
		if (t2 == null) throw new Error('No such tile');
		const t3 = tx.$state.handTiles[house].filter(t => $type(t) === $type(tid)).at(2);
		if (t3 == null) throw new Error('No such tile');
		const t4 = tx.$state.handTiles[house].filter(t => $type(t) === $type(tid)).at(3);
		if (t4 == null) throw new Error('No such tile');
		tx.$state.handTiles[house].splice(tx.$state.handTiles[house].indexOf(t1), 1);
		tx.$state.handTiles[house].splice(tx.$state.handTiles[house].indexOf(t2), 1);
		tx.$state.handTiles[house].splice(tx.$state.handTiles[house].indexOf(t3), 1);
		tx.$state.handTiles[house].splice(tx.$state.handTiles[house].indexOf(t4), 1);
		const tiles = [t1, t2, t3, t4] as const;
		tx.$state.huros[house].push({ type: 'ankan', tiles: tiles });

		tx.clearFirstTurnAndIppatsus();

		tx.$state.activatedDorasCount++;

		const rinsyan = tx.rinshanTsumo();

		tx.$commit();

		return {
			rinsyan,
			tiles,
		};
	}

	/**
	 * ツモ和了
	 * @param house
	 */
	public commit_tsumoHora(house: House, doLog = true) {
		const tx = this.startTransaction();

		if (tx.$state.turn !== house) throw new Error('Not your turn');

		const handTiles = tx.handTileTypes[house];
		const agariTile = handTiles.at(-1)!;
		const huros = tx.$state.huros[house];
		const hurosForYaku = huros.map(convertHuroForCalcYaku);
		if (!isAgarikeiWithHuros(handTiles, hurosForYaku)) throw new Error('Not an agari hand');

		const yakus = calcYakusWithDetail({
			seatWind: house,
			fieldWind: tx.$state.round,
			handTiles,
			huros: hurosForYaku,
			tsumoTile: agariTile,
			ronTile: null,
			firstTurn: tx.$state.firstTurnFlags[house],
			riichi: tx.$state.riichis[house],
			doubleRiichi: tx.$state.doubleRiichis[house],
			ippatsu: tx.$state.ippatsus[house],
			rinshan: tx.$state.rinshanFlags[house],
			haitei: tx.$state.tiles.length === 0,
		});
		if (yakus.yakuNames.length === 0) throw new Error('No yaku');
		const doraCount =
			Common.calcOwnedDoraCount(handTiles, huros, tx.doras) +
			Common.calcRedDoraCount(tx.$state.handTiles[house], huros);
		const factor: Common.PointFactor = yakus.isYakuman
			? { isYakuman: true, value: yakus.value }
			: {
				isYakuman: false,
				fan: yakus.fan,
				fu: calcFu({
					handTiles,
					huros,
					agariTile,
					isTsumo: true,
					seatWind: house,
					fieldWind: tx.$state.round,
					yakuNames: yakus.yakuNames,
					isYakuman: yakus.isYakuman,
				}),
			};
		const pointDeltas = Common.calcTsumoHoraPointDeltas(house, factor, doraCount);
		const honba = tx.$state.honba ?? 0;
		const kyotaku = tx.$state.kyotaku ?? 0;
		Common.applyHonbaToTsumoDeltas(pointDeltas, house, honba);
		if (kyotaku > 0) pointDeltas[house] += 1000 * kyotaku;
		tx.$state.points.e += pointDeltas.e;
		tx.$state.points.s += pointDeltas.s;
		tx.$state.points.w += pointDeltas.w;
		tx.$state.points.n += pointDeltas.n;
		tx.$state.kyotaku = 0;
		tx.$state.turn = null;
		tx.$state.drawnTile = null;
		if (doLog) console.log('yakus', house, yakus);

		tx.$commit();

		return {
			handTiles: tx.$state.handTiles[house],
			tsumoTile: tx.$state.handTiles[house].at(-1)!,
			yakus,
		};
	}

	public commit_resolveCallingInterruption(answers: {
		pon: Record<House, boolean | null> | boolean;
		cii: false | 'x__' | '_x_' | '__x';
		kan: Record<House, boolean | null> | boolean;
		ron: House[];
	}, doLog = true) {
		const tx = this.startTransaction();

		if (tx.$state.askings.pon == null && tx.$state.askings.cii == null && tx.$state.askings.kan == null && tx.$state.askings.ron == null) throw new Error();

		const pon = tx.$state.askings.pon;
		const cii = tx.$state.askings.cii;
		const kan = tx.$state.askings.kan;
		const ron = tx.$state.askings.ron;

		tx.$state.askings.pon = null;
		tx.$state.askings.cii = null;
		tx.$state.askings.kan = null;
		tx.$state.askings.ron = null;

		const priorityHousesOf = (callee: House): House[] => {
			const h1 = Common.nextHouse(callee);
			const h2 = Common.nextHouse(h1);
			const h3 = Common.nextHouse(h2);
			return [h1, h2, h3];
		};
		const pickWinner = (
			asking: { callee: House; callers: House[] } | null,
			answer: Record<House, boolean | null> | boolean,
		): House | null => {
			if (asking == null) return null;
			const claimants: House[] = typeof answer === 'boolean'
				? (answer ? [...asking.callers] : [])
				: asking.callers.filter(h => answer[h] === true);
			for (const house of priorityHousesOf(asking.callee)) {
				if (claimants.includes(house) && !tx.$state.riichis[house]) return house;
			}
			return null;
		};
		const kanWinner = pickWinner(kan, answers.kan);
		const ponWinner = pickWinner(pon, answers.pon);

		if (ron != null) {
			if (tx.$state.furitenFlags == null) {
				tx.$state.furitenFlags = { e: false, s: false, w: false, n: false };
			}
			if (tx.$state.riichiFuritenFlags == null) {
				tx.$state.riichiFuritenFlags = { e: false, s: false, w: false, n: false };
			}
			for (const house of ron.callers) {
				if (!answers.ron.includes(house)) {
					tx.$state.furitenFlags[house] = true;
					if (tx.$state.riichis[house]) {
						tx.$state.riichiFuritenFlags[house] = true;
					}
				}
			}
		}

		if (ron != null && answers.ron.length > 0) {
			const callers = answers.ron;
			const callee = ron.callee;

			const yakus: { [K in House]?: YakuSet } = Object.fromEntries(callers.map(house => {
				const ronTileId = tx.$state.hoTiles[callee].at(-1)!;
				const ronTile = $type(ronTileId);
				const handTiles = tx.handTileTypes[house].concat([ronTile]);
				const huros = tx.$state.huros[house];
				const yakus = calcYakusWithDetail({
					seatWind: house,
					fieldWind: tx.$state.round,
					handTiles,
					huros: huros.map(convertHuroForCalcYaku),
					tsumoTile: null,
					ronTile,
					firstTurn: tx.$state.firstTurnFlags[house],
					riichi: tx.$state.riichis[house],
					doubleRiichi: tx.$state.doubleRiichis[house],
					ippatsu: tx.$state.ippatsus[house],
					hotei: tx.$state.tiles.length === 0,
				});
				const doraCount =
					Common.calcOwnedDoraCount(handTiles, huros, tx.doras) +
					Common.calcRedDoraCount(tx.$state.handTiles[house].concat([ronTileId]), huros);
				const factor: Common.PointFactor = yakus.isYakuman
					? { isYakuman: true, value: yakus.value }
					: {
						isYakuman: false,
						fan: yakus.fan,
						fu: calcFu({
							handTiles,
							huros,
							agariTile: ronTile,
							isTsumo: false,
							seatWind: house,
							fieldWind: tx.$state.round,
							yakuNames: yakus.yakuNames,
							isYakuman: yakus.isYakuman,
						}),
					};
				const point = Common.ronPointWithHonba(Common.calcPoint(factor, house === 'e', doraCount), tx.$state.honba ?? 0);
				tx.$state.points[callee] -= point;
				tx.$state.points[house] += point;
				if (doLog) {
					console.log('yakus', house, yakus);
				}
				return [house, yakus] as const;
			}));

			const kyotaku = tx.$state.kyotaku ?? 0;
			if (kyotaku > 0) {
				const head = Common.findAtamahane(callee, callers);
				tx.$state.points[head] += 1000 * kyotaku;
			}
			tx.$state.kyotaku = 0;
			tx.$state.turn = null;
			tx.$commit();

			return {
				type: 'ronned' as const,
				callers: answers.ron,
				callee: ron.callee,
				turn: null,
				yakus,
			};
		// 種別間の解決順は ron → kan → pon → cii を維持する。
		// ポン対カンの発声順優先は単純化として kan 優先に固定する。
		} else if (kan != null && kanWinner != null) {
			// 大明槓
			const kanCaller = kanWinner;

			const tile = tx.$state.hoTiles[kan.callee].pop()!;
			const t1 = tx.$state.handTiles[kanCaller].filter(t => $type(t) === $type(tile)).at(0);
			if (t1 == null) throw new Error('No such tile');
			const t2 = tx.$state.handTiles[kanCaller].filter(t => $type(t) === $type(tile)).at(1);
			if (t2 == null) throw new Error('No such tile');
			const t3 = tx.$state.handTiles[kanCaller].filter(t => $type(t) === $type(tile)).at(2);
			if (t3 == null) throw new Error('No such tile');

			tx.$state.handTiles[kanCaller].splice(tx.$state.handTiles[kanCaller].indexOf(t1), 1);
			tx.$state.handTiles[kanCaller].splice(tx.$state.handTiles[kanCaller].indexOf(t2), 1);
			tx.$state.handTiles[kanCaller].splice(tx.$state.handTiles[kanCaller].indexOf(t3), 1);

			const tiles = [tile, t1, t2, t3] as const;
			tx.$state.huros[kanCaller].push({ type: 'minkan', tiles: tiles, from: kan.callee });

			tx.clearFirstTurnAndIppatsus();

			tx.$state.activatedDorasCount++;

			tx.$state.turn = kanCaller;
			const rinsyan = tx.rinshanTsumo();
			// 大明槓は鳴いた扱いとし、ツモ牌としては保持しない
			tx.$state.drawnTile = null;

			tx.$commit();

			return {
				type: 'kanned' as const,
				caller: kanCaller,
				callee: kan.callee,
				tiles: tiles,
				rinsyan,
				turn: tx.$state.turn,
			};
		} else if (pon != null && ponWinner != null) {
			const ponCaller = ponWinner;
			const tile = tx.$state.hoTiles[pon.callee].pop()!;
			const t1 = tx.$state.handTiles[ponCaller].filter(t => $type(t) === $type(tile)).at(0);
			if (t1 == null) throw new Error('No such tile');
			const t2 = tx.$state.handTiles[ponCaller].filter(t => $type(t) === $type(tile)).at(1);
			if (t2 == null) throw new Error('No such tile');

			tx.$state.handTiles[ponCaller].splice(tx.$state.handTiles[ponCaller].indexOf(t1), 1);
			tx.$state.handTiles[ponCaller].splice(tx.$state.handTiles[ponCaller].indexOf(t2), 1);

			const tiles = [tile, t1, t2] as const;
			tx.$state.huros[ponCaller].push({ type: 'pon', tiles: tiles, from: pon.callee });

			tx.clearFirstTurnAndIppatsus();

			tx.$state.turn = ponCaller;
			tx.$state.drawnTile = null;

			tx.$commit();

			return {
				type: 'ponned' as const,
				caller: ponCaller,
				callee: pon.callee,
				tiles: tiles,
				turn: tx.$state.turn,
			};
		} else if (cii != null && answers.cii && !tx.$state.riichis[cii.caller]) {
			const ciiTile = tx.$state.hoTiles[cii.callee].at(-1);
			if (ciiTile == null) throw new Error('No such tile');
			const ciiTileType = $type(ciiTile);
			const availableCiiPatterns = Common.getAvailableCiiPatterns(tx.handTileTypes[cii.caller], ciiTileType);
			const isValidCiiPattern = availableCiiPatterns.some(tiles => {
				switch (answers.cii) {
					case 'x__': return tiles[0] === ciiTileType;
					case '_x_': return tiles[1] === ciiTileType;
					case '__x': return tiles[2] === ciiTileType;
					default: return false;
				}
			});
			if (!isValidCiiPattern) throw new Error('Invalid cii pattern');

			const tile = tx.$state.hoTiles[cii.callee].pop()!;
			let tiles: [TileId, TileId, TileId];

			switch (answers.cii) {
				case 'x__': {
					const a = Common.NEXT_TILE_FOR_SHUNTSU[$type(tile)];
					if (a == null) throw new Error();
					const b = Common.NEXT_TILE_FOR_SHUNTSU[a];
					if (b == null) throw new Error();
					const aTile = tx.$state.handTiles[cii.caller].find(t => $type(t) === a);
					if (aTile == null) throw new Error();
					const bTile = tx.$state.handTiles[cii.caller].find(t => $type(t) === b);
					if (bTile == null) throw new Error();
					tx.$state.handTiles[cii.caller].splice(tx.$state.handTiles[cii.caller].indexOf(aTile), 1);
					tx.$state.handTiles[cii.caller].splice(tx.$state.handTiles[cii.caller].indexOf(bTile), 1);
					tiles = [tile, aTile, bTile];
					break;
				}
				case '_x_': {
					const a = Common.PREV_TILE_FOR_SHUNTSU[$type(tile)];
					if (a == null) throw new Error();
					const b = Common.NEXT_TILE_FOR_SHUNTSU[$type(tile)];
					if (b == null) throw new Error();
					const aTile = tx.$state.handTiles[cii.caller].find(t => $type(t) === a);
					if (aTile == null) throw new Error();
					const bTile = tx.$state.handTiles[cii.caller].find(t => $type(t) === b);
					if (bTile == null) throw new Error();
					tx.$state.handTiles[cii.caller].splice(tx.$state.handTiles[cii.caller].indexOf(aTile), 1);
					tx.$state.handTiles[cii.caller].splice(tx.$state.handTiles[cii.caller].indexOf(bTile), 1);
					tiles = [aTile, tile, bTile];
					break;
				}
				case '__x': {
					const a = Common.PREV_TILE_FOR_SHUNTSU[$type(tile)];
					if (a == null) throw new Error();
					const b = Common.PREV_TILE_FOR_SHUNTSU[a];
					if (b == null) throw new Error();
					const aTile = tx.$state.handTiles[cii.caller].find(t => $type(t) === a);
					if (aTile == null) throw new Error();
					const bTile = tx.$state.handTiles[cii.caller].find(t => $type(t) === b);
					if (bTile == null) throw new Error();
					tx.$state.handTiles[cii.caller].splice(tx.$state.handTiles[cii.caller].indexOf(aTile), 1);
					tx.$state.handTiles[cii.caller].splice(tx.$state.handTiles[cii.caller].indexOf(bTile), 1);
					tiles = [bTile, aTile, tile];
					break;
				}
			}

			tx.$state.huros[cii.caller].push({ type: 'cii', tiles: tiles, from: cii.callee, pattern: answers.cii });

			tx.clearFirstTurnAndIppatsus();

			tx.$state.turn = cii.caller;
			tx.$state.drawnTile = null;

			tx.$commit();

			return {
				type: 'ciied' as const,
				caller: cii.caller,
				callee: cii.callee,
				tiles: tiles,
				turn: tx.$state.turn,
			};
		} else if (tx.$state.tiles.length === 0) {
			// 流局

			tx.$state.turn = null;
			tx.$state.nextTurnAfterAsking = null;

			tx.$commit();

			return {
				type: 'ryuukyoku' as const,
			};
		} else {
			tx.$state.turn = tx.$state.nextTurnAfterAsking!;
			tx.$state.nextTurnAfterAsking = null;

			const tile = tx.tsumo();

			tx.$commit();

			return {
				type: 'tsumo' as const,
				house: tx.$state.turn,
				tile,
				turn: tx.$state.turn,
			};
		}
	}

	public createPlayerState(index: 1 | 2 | 3 | 4): PlayerState {
		const house = this.getHouse(index);

		const hideAnkan = (huros: Huro[]): Huro[] => huros.map(huro => huro.type === 'ankan' ? {
			...huro,
			tiles: [0, 0, 0, 0] as const,
		} : huro);

		const askings = this.$state.askings;
		const canCall = !this.$state.riichis[house];

		return {
			user1House: this.$state.user1House,
			user2House: this.$state.user2House,
			user3House: this.$state.user3House,
			user4House: this.$state.user4House,
			round: this.$state.round,
			kyoku: this.$state.kyoku,
			turnCount: this.$state.turnCount,
			tilesCount: this.$state.tiles.length,
			doraIndicateTiles: this.$state.kingTiles.slice(0, this.$state.activatedDorasCount),
			drawnTile: this.$state.turn === house ? (this.$state.drawnTile ?? null) : null,
			handTiles: {
				e: house === 'e' ? this.$state.handTiles.e : this.$state.handTiles.e.map(() => 0),
				s: house === 's' ? this.$state.handTiles.s : this.$state.handTiles.s.map(() => 0),
				w: house === 'w' ? this.$state.handTiles.w : this.$state.handTiles.w.map(() => 0),
				n: house === 'n' ? this.$state.handTiles.n : this.$state.handTiles.n.map(() => 0),
			},
			hoTiles: {
				e: this.$state.hoTiles.e,
				s: this.$state.hoTiles.s,
				w: this.$state.hoTiles.w,
				n: this.$state.hoTiles.n,
			},
			huros: {
				e: house === 'e' ? this.$state.huros.e : hideAnkan(this.$state.huros.e),
				s: house === 's' ? this.$state.huros.s : hideAnkan(this.$state.huros.s),
				w: house === 'w' ? this.$state.huros.w : hideAnkan(this.$state.huros.w),
				n: house === 'n' ? this.$state.huros.n : hideAnkan(this.$state.huros.n),
			},
			firstTurnFlags: {
				e: this.$state.firstTurnFlags.e,
				s: this.$state.firstTurnFlags.s,
				w: this.$state.firstTurnFlags.w,
				n: this.$state.firstTurnFlags.n,
			},
			riichis: {
				e: this.$state.riichis.e,
				s: this.$state.riichis.s,
				w: this.$state.riichis.w,
				n: this.$state.riichis.n,
			},
			doubleRiichis: {
				e: this.$state.doubleRiichis.e,
				s: this.$state.doubleRiichis.s,
				w: this.$state.doubleRiichis.w,
				n: this.$state.doubleRiichis.n,
			},
			ippatsus: {
				e: this.$state.ippatsus.e,
				s: this.$state.ippatsus.s,
				w: this.$state.ippatsus.w,
				n: this.$state.ippatsus.n,
			},
			rinshanFlags: {
				e: this.$state.rinshanFlags.e,
				s: this.$state.rinshanFlags.s,
				w: this.$state.rinshanFlags.w,
				n: this.$state.rinshanFlags.n,
			},
			points: {
				e: this.$state.points.e,
				s: this.$state.points.s,
				w: this.$state.points.w,
				n: this.$state.points.n,
			},
			honba: this.$state.honba ?? 0,
			kyotaku: this.$state.kyotaku ?? 0,
			latestDahaiedTile: null,
			turn: this.$state.turn,
			canPon: canCall && askings.pon != null && askings.pon.callers.includes(house) ? { callee: askings.pon.callee } : null,
			canCii: canCall && askings.cii?.caller === house ? { callee: askings.cii.callee } : null,
			canKan: canCall && askings.kan != null && askings.kan.callers.includes(house) ? { callee: askings.kan.callee } : null,
			canRon: askings.ron?.callers.includes(house) ? { callee: askings.ron.callee } : null,
		};
	}

	public createSpectatorState(): PlayerState {
		const state = this.createPlayerState(1);
		state.spectator = true;
		state.drawnTile = this.$state.drawnTile ?? null;
		state.handTiles = structuredClone(this.$state.handTiles);
		state.huros = structuredClone(this.$state.huros);
		return state;
	}

	public calcCrc32ForUser1(): number {
		throw new Error('TODO');
	}

	public calcCrc32ForUser2(): number {
		throw new Error('TODO');
	}

	public calcCrc32ForUser3(): number {
		throw new Error('TODO');
	}

	public calcCrc32ForUser4(): number {
		throw new Error('TODO');
	}

	public getState(): MasterState {
		return structuredClone(this.$state);
	}
}

function commit_dahai(state: MasterState): MasterState {
	throw new Error('Not implemented');
}
