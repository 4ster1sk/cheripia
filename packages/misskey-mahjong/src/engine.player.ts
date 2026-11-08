/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { TileType, House, Huro, TileId } from './common.js';
import * as Common from './common.js';
import { calcYakusWithDetail, convertHuroForCalcYaku, getWaitTiles, isAgarikeiWithHuros } from './common.yaku.js';
import { calcFu } from './common.fu.js';

//#region syntax suger
function $(tid: TileId): Common.TileInstance {
	return Common.findTileByIdOrFail(tid);
}

function $type(tid: TileId): TileType {
	return $(tid).t;
}
//#endregion

export type PlayerState = {
	user1House: House;
	user2House: House;
	user3House: House;
	user4House: House;

	round: 'e' | 's' | 'w' | 'n';
	kyoku: number;

	turnCount: number;
	tilesCount: number;
	doraIndicateTiles: TileId[];

	/**
	 * 副露した牌を含まない手牌
	 */
	handTiles: {
		e: TileId[] | 0[];
		s: TileId[] | 0[];
		w: TileId[] | 0[];
		n: TileId[] | 0[];
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
	points: {
		e: number;
		s: number;
		w: number;
		n: number;
	};
	latestDahaiedTile: TileId | null;
	turn: House | null;
	canPon: { callee: House } | null;
	canCii: { callee: House } | null;
	canKan: { callee: House } | null; // = 大明槓
	canRon: { callee: House } | null;
	spectator?: boolean;
};

export type KyokuResult = {
	yakus: { name: string; fan: number | null; isYakuman: boolean; }[];
	doraCount: number;
	pointDeltas: { e: number; s: number; w: number; n: number; };
};

export class PlayerGameEngine {
	/**
	 * このエラーが発生したときはdesyncが疑われる
	 */
	public static InvalidOperationError = class extends Error {};

	private myUserNumber: 1 | 2 | 3 | 4;
	private state: PlayerState;

	constructor(myUserNumber: PlayerGameEngine['myUserNumber'], state: PlayerState) {
		this.myUserNumber = myUserNumber;
		this.state = state;
	}

	public get doras(): TileType[] {
		return this.state.doraIndicateTiles.map(t => Common.nextTileForDora($type(t)));
	}

	public get doraIndicateTiles(): TileId[] {
		return this.state.doraIndicateTiles;
	}

	public get points(): Record<House, number> {
		return this.state.points;
	}

	public get handTiles(): Record<House, number[]> {
		return this.state.handTiles;
	}

	public get hoTiles(): Record<House, number[]> {
		return this.state.hoTiles;
	}

	public get huros(): Record<House, Huro[]> {
		return this.state.huros;
	}

	public get turnCount(): number {
		return this.state.turnCount;
	}

	public get tilesCount(): number {
		return this.state.tilesCount;
	}

	public get canRon(): PlayerState['canRon'] {
		return this.state.canRon;
	}

	public get canPon(): PlayerState['canPon'] {
		return this.state.canPon;
	}

	public get canKan(): PlayerState['canKan'] {
		return this.state.canKan;
	}

	public get canCii(): PlayerState['canCii'] {
		return this.state.canCii;
	}

	public get turn(): House | null {
		return this.state.turn;
	}

	public get user1House(): House {
		return this.state.user1House;
	}

	public get user2House(): House {
		return this.state.user2House;
	}

	public get user3House(): House {
		return this.state.user3House;
	}

	public get user4House(): House {
		return this.state.user4House;
	}

	public get myHouse(): House {
		switch (this.myUserNumber) {
			case 1: return this.state.user1House;
			case 2: return this.state.user2House;
			case 3: return this.state.user3House;
			case 4: return this.state.user4House;
		}
	}

	public get myHandTiles(): TileId[] {
		return this.state.handTiles[this.myHouse] as TileId[];
	}

	public get myHandTileTypes(): TileType[] {
		return this.myHandTiles.map(t => $type(t));
	}

	public get isMeRiichi(): boolean {
		return this.state.riichis[this.myHouse];
	}

	public commit_nextKyoku(state: PlayerState) {
		this.state = state;
	}

	public commit_ryuukyoku(pointDeltas: Record<House, number>) {
		this.state.points.e += pointDeltas.e;
		this.state.points.s += pointDeltas.s;
		this.state.points.w += pointDeltas.w;
		this.state.points.n += pointDeltas.n;
		this.state.turn = null;
	}

	public commit_tsumo(house: House, tid: TileId) {
		console.log('commit_tsumo', this.state.turn, house, tid);
		this.state.tilesCount--;
		this.state.turn = house;
		this.state.canRon = null;
		this.state.canPon = null;
		this.state.canKan = null;
		this.state.canCii = null;
		if (house === this.myHouse) {
			this.myHandTiles.push(tid);
		} else {
			this.state.handTiles[house].push(0);
		}
	}

	public commit_dahai(house: House, tid: TileId, riichi = false) {
		console.log('commit_dahai', this.state.turn, house, tid, riichi);
		if (this.state.turn !== house) throw new PlayerGameEngine.InvalidOperationError();

		if (riichi) {
			if (this.state.firstTurnFlags[house]) this.state.doubleRiichis[house] = true;
			this.state.riichis[house] = true;
			this.state.ippatsus[house] = true;
		} else if (this.state.riichis[house]) {
			this.state.ippatsus[house] = false;
		} else {
			this.state.firstTurnFlags[house] = false;
		}
		this.state.firstTurnFlags[house] = false;
		this.state.rinshanFlags[house] = false;

		if (house === this.myHouse) {
			this.myHandTiles.splice(this.myHandTiles.indexOf(tid), 1);
			this.state.hoTiles[this.myHouse].push(tid);
		} else {
			this.state.handTiles[house].pop();
			this.state.hoTiles[house].push(tid);
		}

		this.state.turn = null;

		if (house === this.myHouse) {
			this.state.canRon = null;
			this.state.canPon = null;
			this.state.canKan = null;
			this.state.canCii = null;
		} else {
			const ronTile = $type(tid);
			const huros = this.state.huros[this.myHouse].map(convertHuroForCalcYaku);
			const ronYakus = calcYakusWithDetail({
				seatWind: this.myHouse,
				fieldWind: this.state.round,
				handTiles: this.myHandTileTypes.concat([ronTile]),
				huros,
				tsumoTile: null,
				ronTile,
				firstTurn: this.state.firstTurnFlags[this.myHouse],
				riichi: this.state.riichis[this.myHouse],
				doubleRiichi: this.state.doubleRiichis[this.myHouse],
				ippatsu: this.state.ippatsus[this.myHouse],
				hotei: this.state.tilesCount === 0,
			});
			const canRon = isAgarikeiWithHuros(this.myHandTileTypes.concat([ronTile]), huros) && ronYakus.yakuNames.length > 0;
			const canPon = !this.isMeRiichi && this.myHandTileTypes.filter(t => t === $type(tid)).length === 2;
			const canKan = !this.isMeRiichi && this.myHandTileTypes.filter(t => t === $type(tid)).length === 3;
			const canCii = !this.isMeRiichi && house === Common.prevHouse(this.myHouse) &&
				Common.SHUNTU_PATTERNS.some(pattern =>
					pattern.includes($type(tid)) &&
					pattern.filter(t => this.myHandTileTypes.includes(t) && t !== $type(tid)).length >= 2);

			this.state.canRon = canRon ? { callee: house } : null;
			this.state.canPon = canPon ? { callee: house } : null;
			this.state.canKan = canKan ? { callee: house } : null;
			this.state.canCii = canCii ? { callee: house } : null;
		}
	}

	public canTsumoHora(): boolean {
		if (this.state.turn !== this.myHouse) return false;
		const huros = this.state.huros[this.myHouse].map(convertHuroForCalcYaku);
		if (!isAgarikeiWithHuros(this.myHandTileTypes, huros)) return false;
		const tsumoTile = this.myHandTiles.at(-1);
		if (tsumoTile == null) return false;
		try {
			const yakus = calcYakusWithDetail({
				seatWind: this.myHouse,
				fieldWind: this.state.round,
				handTiles: this.myHandTileTypes,
				huros,
				tsumoTile: $type(tsumoTile),
				ronTile: null,
				firstTurn: this.state.firstTurnFlags[this.myHouse],
				riichi: this.state.riichis[this.myHouse],
				doubleRiichi: this.state.doubleRiichis[this.myHouse],
				ippatsu: this.state.ippatsus[this.myHouse],
				rinshan: this.state.rinshanFlags[this.myHouse],
				haitei: this.state.tilesCount === 0,
			});
			return yakus.yakuNames.length > 0;
		} catch {
			return false;
		}
	}

	public getWaitTiles(): TileType[] {
		const huros = this.state.huros[this.myHouse].map(convertHuroForCalcYaku);
		return getWaitTiles(this.myHandTileTypes, huros);
	}

	public commit_tsumoHora(house: House, handTiles: TileId[], tsumoTile: TileId): KyokuResult {
		console.log('commit_tsumoHora', this.state.turn, house);
		this.clearCalls();

		const handTileTypes = handTiles.map(id => $type(id));
		const agariTile = $type(tsumoTile);
		const huros = this.state.huros[house];
		const yakus = calcYakusWithDetail({
			seatWind: house,
			fieldWind: this.state.round,
			handTiles: handTileTypes,
			huros: huros.map(convertHuroForCalcYaku),
			tsumoTile: agariTile,
			ronTile: null,
			firstTurn: this.state.firstTurnFlags[house],
			riichi: this.state.riichis[house],
			doubleRiichi: this.state.doubleRiichis[house],
			ippatsu: this.state.ippatsus[house],
			rinshan: this.state.rinshanFlags[house],
			haitei: this.state.tilesCount === 0,
		});
		const doraCount =
			Common.calcOwnedDoraCount(handTileTypes, huros, this.doras) +
			Common.calcRedDoraCount(handTiles, huros);
		const factor: Common.PointFactor = yakus.isYakuman
			? { isYakuman: true, value: yakus.value }
			: {
				isYakuman: false,
				fan: yakus.fan,
				fu: calcFu({
					handTiles: handTileTypes,
					huros,
					agariTile,
					isTsumo: true,
					seatWind: house,
					fieldWind: this.state.round,
					yakuNames: yakus.yakuNames,
					isYakuman: yakus.isYakuman,
				}),
			};
		const pointDeltas = Common.calcTsumoHoraPointDeltas(house, factor, doraCount);
		this.state.points.e += pointDeltas.e;
		this.state.points.s += pointDeltas.s;
		this.state.points.w += pointDeltas.w;
		this.state.points.n += pointDeltas.n;

		return {
			yakus: yakus.yakus,
			doraCount,
			pointDeltas,
		};
	}

	/**
	 * ロンします
	 * @param callers ロンした人
	 * @param callee 牌を捨てた人
	 */
	public commit_ronHora(callers: House[], callee: House, handTiles: {
		e: TileId[];
		s: TileId[];
		w: TileId[];
		n: TileId[];
	}): Record<House, KyokuResult | null> {
		console.log('commit_ronHora', this.state.turn, callers, callee);

		this.clearCalls();

		const resultMap: Record<House, KyokuResult> = {
			e: { yakus: [], doraCount: 0, pointDeltas: { e: 0, s: 0, w: 0, n: 0 } },
			s: { yakus: [], doraCount: 0, pointDeltas: { e: 0, s: 0, w: 0, n: 0 } },
			w: { yakus: [], doraCount: 0, pointDeltas: { e: 0, s: 0, w: 0, n: 0 } },
			n: { yakus: [], doraCount: 0, pointDeltas: { e: 0, s: 0, w: 0, n: 0 } },
		};

		const ronTileId = this.state.hoTiles[callee].at(-1)!;
		const ronTile = $type(ronTileId);
		for (const house of callers) {
			const handTileTypes = handTiles[house].map(id => $type(id)).concat([ronTile]);
			const huros = this.state.huros[house];
			const yakus = calcYakusWithDetail({
				seatWind: house,
				fieldWind: this.state.round,
				handTiles: handTileTypes,
				huros: huros.map(convertHuroForCalcYaku),
				tsumoTile: null,
				ronTile,
				firstTurn: this.state.firstTurnFlags[house],
				riichi: this.state.riichis[house],
				doubleRiichi: this.state.doubleRiichis[house],
				ippatsu: this.state.ippatsus[house],
				hotei: this.state.tilesCount === 0,
			});
			const doraCount =
				Common.calcOwnedDoraCount(handTileTypes, huros, this.doras) +
				Common.calcRedDoraCount(handTiles[house].concat([ronTileId]), huros);
			const factor: Common.PointFactor = yakus.isYakuman
				? { isYakuman: true, value: yakus.value }
				: {
					isYakuman: false,
					fan: yakus.fan,
					fu: calcFu({
						handTiles: handTileTypes,
						huros,
						agariTile: ronTile,
						isTsumo: false,
						seatWind: house,
						fieldWind: this.state.round,
						yakuNames: yakus.yakuNames,
						isYakuman: yakus.isYakuman,
					}),
				};
			const point = Common.calcPoint(factor, house === 'e', doraCount);
			this.state.points[callee] -= point;
			this.state.points[house] += point;
			resultMap[house].yakus = yakus.yakus;
			resultMap[house].doraCount = doraCount;
			resultMap[house].pointDeltas[callee] = -point;
			resultMap[house].pointDeltas[house] = point;
		}

		return {
			e: callers.includes('e') ? resultMap.e : null,
			s: callers.includes('s') ? resultMap.s : null,
			w: callers.includes('w') ? resultMap.w : null,
			n: callers.includes('n') ? resultMap.n : null,
		};
	}

	private clearCalls() {
		this.state.canRon = null;
		this.state.canPon = null;
		this.state.canKan = null;
		this.state.canCii = null;
	}

	private clearFirstTurnAndIppatsus() {
		for (const house of ['e', 's', 'w', 'n'] as const) {
			this.state.firstTurnFlags[house] = false;
			this.state.ippatsus[house] = false;
		}
	}

	/**
	 * ポンします
	 * @param caller ポンした人
	 * @param callee 牌を捨てた人
	 */
	public commit_pon(caller: House, callee: House, tiles: readonly [TileId, TileId, TileId]) {
		this.clearCalls();
		this.clearFirstTurnAndIppatsus();

		this.state.hoTiles[callee].pop();
		if (caller === this.myHouse) {
			if (this.myHandTiles.includes(tiles[0])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[0]), 1);
			if (this.myHandTiles.includes(tiles[1])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[1]), 1);
			if (this.myHandTiles.includes(tiles[2])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[2]), 1);
		} else {
			this.state.handTiles[caller].splice(0, 2);
		}
		this.state.huros[caller].push({ type: 'pon', tiles: tiles, from: callee });

		this.state.turn = caller;
	}

	/**
	 * 大明槓します
	 * @param caller 大明槓した人
	 * @param callee 牌を捨てた人
	 */
	public commit_kan(caller: House, callee: House, tiles: readonly [TileId, TileId, TileId, TileId], rinsyan: TileId, doraIndicateTiles?: TileId[]) {
		this.clearCalls();
		this.clearFirstTurnAndIppatsus();

		this.state.hoTiles[callee].pop();
		if (caller === this.myHouse) {
			if (this.myHandTiles.includes(tiles[0])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[0]), 1);
			if (this.myHandTiles.includes(tiles[1])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[1]), 1);
			if (this.myHandTiles.includes(tiles[2])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[2]), 1);
			if (this.myHandTiles.includes(tiles[3])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[3]), 1);
		} else {
			this.state.handTiles[caller].splice(0, 3);
			this.state.handTiles[caller].push(0);
		}
		if (caller === this.myHouse) {
			this.myHandTiles.push(rinsyan);
		}
		this.state.tilesCount--;
		this.state.huros[caller].push({ type: 'minkan', tiles: tiles, from: callee });

		if (doraIndicateTiles != null) this.state.doraIndicateTiles = [...doraIndicateTiles];

		this.state.turn = caller;
	}

	public commit_kakan(house: House, tiles: readonly TileId[], rinsyan: TileId, doraIndicateTiles?: TileId[]) {
		console.log('commit_kakan', this.state.turn, house, tiles);
		this.clearCalls();
		this.clearFirstTurnAndIppatsus();
		this.state.rinshanFlags[house] = true;

		const pon = this.state.huros[house].find((h): h is Huro & { type: 'pon' } => h.type === 'pon' && $type(h.tiles[0]) === $type(tiles[0]));
		if (house === this.myHouse) {
			const tile = this.myHandTiles.find(t => $type(t) === $type(tiles[0]));
			if (tile != null) this.myHandTiles.splice(this.myHandTiles.indexOf(tile), 1);
			this.myHandTiles.push(rinsyan);
		} else {
			this.state.handTiles[house].pop();
			this.state.handTiles[house].push(0);
		}
		if (pon != null) {
			const index = this.state.huros[house].indexOf(pon);
			this.state.huros[house][index] = { type: 'minkan', tiles: [tiles[0], tiles[1], tiles[2], tiles[3]], from: pon.from };
		}
		this.state.tilesCount--;
		this.state.turn = house;
		this.state.canRon = null;
		this.state.canPon = null;
		this.state.canKan = null;
		this.state.canCii = null;
		if (doraIndicateTiles != null) this.state.doraIndicateTiles = [...doraIndicateTiles];
	}

	public commit_ankan(house: House, tiles: readonly TileId[], rinsyan: TileId, doraIndicateTiles?: TileId[]) {
		console.log('commit_ankan', this.state.turn, house, tiles);
		this.clearCalls();
		this.clearFirstTurnAndIppatsus();
		this.state.rinshanFlags[house] = true;

		if (house === this.myHouse) {
			for (const tile of tiles) {
				const index = this.myHandTiles.indexOf(tile);
				if (index !== -1) this.myHandTiles.splice(index, 1);
			}
			this.myHandTiles.push(rinsyan);
		} else {
			this.state.handTiles[house].splice(0, 4);
			this.state.handTiles[house].push(0);
		}
		this.state.huros[house].push({
			type: 'ankan',
			tiles: house === this.myHouse ? [tiles[0], tiles[1], tiles[2], tiles[3]] : [0, 0, 0, 0],
		});
		this.state.tilesCount--;
		this.state.turn = house;
		this.state.canRon = null;
		this.state.canPon = null;
		this.state.canKan = null;
		this.state.canCii = null;
		if (doraIndicateTiles != null) this.state.doraIndicateTiles = [...doraIndicateTiles];
	}

	/**
	 * チーします
	 * @param caller チーした人
	 * @param callee 牌を捨てた人
	 */
	public commit_cii(caller: House, callee: House, tiles: readonly [TileId, TileId, TileId]) {
		this.clearCalls();
		this.clearFirstTurnAndIppatsus();

		this.state.hoTiles[callee].pop();
		if (caller === this.myHouse) {
			if (this.myHandTiles.includes(tiles[0])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[0]), 1);
			if (this.myHandTiles.includes(tiles[1])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[1]), 1);
			if (this.myHandTiles.includes(tiles[2])) this.myHandTiles.splice(this.myHandTiles.indexOf(tiles[2]), 1);
		} else {
			this.state.handTiles[caller].splice(0, 2);
		}
		this.state.huros[caller].push({ type: 'cii', tiles: tiles, from: callee });

		this.state.turn = caller;
	}

	public commit_nop() {
		this.state.canRon = null;
		this.state.canPon = null;
		this.state.canKan = null;
		this.state.canCii = null;
	}

	public get isMenzen(): boolean {
		const calls = ['pon', 'cii', 'minkan'];
		return this.state.huros[this.myHouse].filter(h => calls.includes(h.type)).length === 0;
	}

	public canRiichi(): boolean {
		if (this.state.turn !== this.myHouse) return false;
		if (this.state.riichis[this.myHouse]) return false;
		if (this.state.points[this.myHouse] < 1000) return false;
		if (!this.isMenzen) return false;
		if (Common.getTilesForRiichi(this.myHandTileTypes).length === 0) return false;
		return true;
	}

	public canAnkan(): boolean {
		if (this.state.turn !== this.myHouse) return false;
		return this.myHandTiles
			.filter(t => this.myHandTiles
				.filter(tt => $type(tt) === $type(t)).length >= 4).length > 0;
	}

	public canKakan(): boolean {
		if (this.state.turn !== this.myHouse) return false;
		return this.state.huros[this.myHouse].filter(h => h.type === 'pon' && this.myHandTileTypes.includes($type(h.tiles[0]))).length > 0;
	}

	public getAnkanableTiles(): TileId[] {
		return this.myHandTiles.filter(t => this.myHandTiles.filter(tt => $type(tt) === $type(t)).length >= 4);
	}

	public getKakanableTiles(): TileId[] {
		return this.myHandTiles.filter(t => this.state.huros[this.myHouse].some(h => h.type === 'pon' && $type(t) === $type(h.tiles[0])));
	}

	public getState(): PlayerState {
		return structuredClone(this.state);
	}
}
