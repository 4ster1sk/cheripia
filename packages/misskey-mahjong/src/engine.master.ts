/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { TileType, House, Huro, TileId } from './common.js';
import * as Common from './common.js';
import { PlayerState } from './engine.player.js';
import { calcYakusWithDetail, convertHuroForCalcYaku, getWaitTiles, isAgarikeiWithHuros, isFirstDiscardRon, isNagashimanganHo, YakuData, YakuSet } from './common.yaku.js';
import { calcFu } from './common.fu.js';

export const INITIAL_POINT = 25000;

/**
 * いずれかの持ち点が0以下ならトビ終了とする。
 */
export function isTobiPoints(points: Record<House, number>): boolean {
	return (['e', 's', 'w', 'n'] as const).some(house => points[house] <= 0);
}

/**
 * 中途流局の種別。
 */
export type AbortiveDrawKind = 'kyushukyuhai' | 'suufonrenda' | 'suuchariichi' | 'sanchaho' | 'suukaikan';

/**
 * 中途流局の発生を通知する例外。
 * StateManager のトランザクション内で投げられた場合は $commit 前のため
 * state は無変更のまま残り、サービス側で個別 catch して流局処理へ進む。
 */
export class AbortiveDrawError extends Error {
	public kind: AbortiveDrawKind;

	constructor(kind: AbortiveDrawKind) {
		super(`Abortive draw: ${kind}`);
		this.name = 'AbortiveDrawError';
		this.kind = kind;
	}
}

/**
 * 手牌種のうち幺九牌の種類数を数える。
 */
function countYaochuKinds(handTileTypes: TileType[]): number {
	return new Set(handTileTypes.filter(t => Common.includes(Common.YAOCHU_TILES, t))).size;
}

/**
 * 暗槓・明槓の合計数と槓を行った家の数を数える。
 */
function countKans(state: MasterState): { total: number; houses: number } {
	let total = 0;
	let houses = 0;
	for (const house of ['e', 's', 'w', 'n'] as const) {
		const count = state.huros[house].filter(huro => huro.type === 'ankan' || huro.type === 'minkan').length;
		if (count > 0) {
			houses++;
			total += count;
		}
	}
	return { total, houses };
}

/**
 * 各カン確定時（副露反映後）に呼ぶ。四開槓の中断条件と5つ目の通常拒否を判定する。
 * 四開槓は複数家に跨る4つ目のカンで成立し、同一人物の4カンは続行する。
 * 5つ目になるカンは通常エラーで拒否する。
 */
function assertKanLimit(state: MasterState): void {
	const { total, houses } = countKans(state);
	if (total >= 5) throw new Error('Too many kans');
	if (total === 4 && houses > 1) throw new AbortiveDrawError('suukaikan');
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
	if ((state as { kakanRon?: MasterState['kakanRon'] }).kakanRon === undefined) {
		state.kakanRon = null;
	}
	if ((state as { riichiTiles?: MasterState['riichiTiles'] }).riichiTiles === undefined) {
		state.riichiTiles = { e: null, s: null, w: null, n: null };
	}
	// 旧セーブには対局形式が無いため、欠落・不正値は東南戦 ('south') 扱いとする。
	if ((state as { matchLength?: unknown }).matchLength !== 'east' && (state as { matchLength?: unknown }).matchLength !== 'south') {
		state.matchLength = 'south';
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

	public get uraDoraIndicateTiles(): TileId[] {
		// 王牌14枚の後半7枚を裏ドラ表示牌列とみなす。
		// 8回以上のカンで表プールと重なるが実戦上到達しないため単純化する。
		return this.$state.kingTiles.slice(7, 7 + this.$state.activatedDorasCount);
	}

	public get uraDoras(): TileType[] {
		return this.uraDoraIndicateTiles.map(id => Common.nextTileForDora($type(id)));
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

	public canRon(house: House, tid: TileId, callee: House | null = null): boolean {
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
			chankan: this.$state.kakanRon != null && $type(tid) === this.$state.kakanRon.tile,
			// 人和の前提 (局の最初の捨て牌) は河・初巡フラグで判定する。加槓時はフラグ消去済みのため不成立になる。
			renhou: callee != null && isFirstDiscardRon(
				{ e: this.$state.hoTiles.e.length, s: this.$state.hoTiles.s.length, w: this.$state.hoTiles.w.length, n: this.$state.hoTiles.n.length },
				this.$state.firstTurnFlags,
				this.$state.turnCount,
				callee,
			),
		});

		return yakus.yakuNames.length > 0; // 役がない
	}

	public canPon(house: House, tid: TileId): boolean {
		return this.handTileTypes[house].filter(t => t === $type(tid)).length >= 2;
	}

	public canDaiminkan(caller: House, tid: TileId): boolean {
		// 5つ目になる大明槓は asking を立てずに不成立とする。
		// 解決時に通常エラーになると問合せが残留して局が停止するため、事前に拒否する。
		if (countKans(this.$state).total >= 4) return false;
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
		// 九種九牌: 第一ツモで引牌込み14枚の幺九牌が9種以上なら、壁・手牌を変更する前に中斷する。
		const turnHouse = this.$state.turn;
		if (turnHouse != null && this.$state.firstTurnFlags[turnHouse]) {
			const top = this.$state.tiles.at(-1);
			if (top != null) {
				const kinds = countYaochuKinds([...this.$state.handTiles[turnHouse].map(id => $type(id)), $type(top)]);
				if (kinds >= 9) throw new AbortiveDrawError('kyushukyuhai');
			}
		}
		return this.withTsumoTile(this.$state.tiles.pop(), false);
	}

	public rinshanTsumo(): TileId {
		// 嶺上牌は王牌から取る。カン1回につき嶺上1枚・ドラ表示+1で、
		// activatedDorasCount は初期値1のため今回分を含む消費枚数 = activatedDorasCount - 1。
		// 初回嶺上が王牌末尾になるよう index = kingTiles.length - (activatedDorasCount - 1)
		// = kingTiles.length - activatedDorasCount + 1 とする。
		// kingTiles 自体は削らず読み取るだけとし、表ドラ slice(0,n)・裏ドラ slice(7,7+n) の
		// 参照位置を保つ。3回までのカン(n<=4)では嶺上範囲と表・裏ドラ表示範囲は重ならない。
		// 4回目以降は裏ドラ表示と重なりうるが、四開槓の中断は対象外のため単純化する。
		const kanCountIncludingCurrent = this.$state.activatedDorasCount - 1;
		const index = this.$state.kingTiles.length - kanCountIncludingCurrent;
		return this.withTsumoTile(this.$state.kingTiles[index], true);
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
	/**
	 * 対局形式。'east' は東風戦（東4局の終了で対局終了）、'south' は東南戦（南入あり）。
	 * 旧セーブには存在しないため、読み込み時は 'south' にフォールバックする。
	 */
	matchLength: 'east' | 'south';
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
	riichiTiles: {
		e: TileId | null;
		s: TileId | null;
		w: TileId | null;
		n: TileId | null;
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
	/**
	 * 加槓ロン待ちの保留情報。commit_kakan で asking を立てた場合のみ設定される。
	 */
	kakanRon: { house: House; tile: TileType; tileId: TileId } | null;
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

	public get uraDoraIndicateTiles(): TileId[] {
		// 王牌14枚の後半7枚を裏ドラ表示牌列とみなす。
		// 8回以上のカンで表プールと重なるが実戦上到達しないため単純化する。
		return this.$state.kingTiles.slice(7, 7 + this.$state.activatedDorasCount);
	}

	public get uraDoras(): TileType[] {
		return this.stateManager.uraDoras;
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

	public get riichiTiles(): Record<House, TileId | null> {
		return this.stateManager.$state.riichiTiles;
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

	/**
	 * 局開始時の親14枚が九種九牌か判定し、該当すれば中斷する。
	 * 親は席 'e' 固定（プレイヤーが回転する設計）のため 'e' の手牌を見る。
	 * 読み取りのみで state を変更しない。
	 */
	public assertKyushuKyuhai(): void {
		if (countYaochuKinds(this.stateManager.handTileTypes.e) >= 9) {
			throw new AbortiveDrawError('kyushukyuhai');
		}
	}

	public commit_ryuukyoku(): {
		tenpaiHouses: House[];
		notenHouses: House[];
		pointDeltas: Record<House, number>;
		nagashiHouses: House[];
	} {
		const tx = this.startTransaction();

		// 流し満貫: 副露なし・捨て牌全幺九牌の家を成就者として検出する。
		const nagashiHouses = (['e', 's', 'w', 'n'] as const).filter(house =>
			isNagashimanganHo(tx.hoTileTypes[house], tx.$state.huros[house].map(convertHuroForCalcYaku)),
		);

		if (nagashiHouses.length > 0) {
			// 成就者がいる場合、テンパイ料の授受は行わず、成就者への役満ツモ相当の支払いに置き換える。
			// 既存のツモ点数ヘルパーを流用し、本場加算あり・供託は成就者が総取りとする。
			// 複数成就は各自に支払う稀なケースとして重ね合わせ、供託は席順先頭が取得する (単純化)。
			const pointDeltas: Record<House, number> = { e: 0, s: 0, w: 0, n: 0 };
			const honba = tx.$state.honba ?? 0;
			for (const house of nagashiHouses) {
				const deltas = Common.calcTsumoHoraPointDeltas(house, { isYakuman: true, value: 1 });
				Common.applyHonbaToTsumoDeltas(deltas, house, honba);
				pointDeltas.e += deltas.e;
				pointDeltas.s += deltas.s;
				pointDeltas.w += deltas.w;
				pointDeltas.n += deltas.n;
			}
			const kyotaku = tx.$state.kyotaku ?? 0;
			if (kyotaku > 0) pointDeltas[nagashiHouses[0]] += 1000 * kyotaku;
			tx.$state.points.e += pointDeltas.e;
			tx.$state.points.s += pointDeltas.s;
			tx.$state.points.w += pointDeltas.w;
			tx.$state.points.n += pointDeltas.n;
			tx.$state.kyotaku = 0;
			tx.$state.honba = (tx.$state.honba ?? 0) + 1;
			tx.$state.turn = null;
			tx.$state.drawnTile = null;

			tx.$commit();

			return {
				tenpaiHouses: [],
				notenHouses: (['e', 's', 'w', 'n'] as const).filter(house => !nagashiHouses.includes(house)),
				pointDeltas,
				nagashiHouses,
			};
		}

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
			nagashiHouses: [],
		};
	}

	/**
	 * 中途流局を成立させる。本場+1のみ行い、供託・点数は不変とする。
	 * 中途流局は標準ルールで親の連荘・本場+1・点数移動なし・供託据え置きとする（単純化）。
	 */
	public commit_abortiveDraw(kind: AbortiveDrawKind): {
		tenpaiHouses: House[];
		notenHouses: House[];
		pointDeltas: Record<House, number>;
		abortive: AbortiveDrawKind;
	} {
		const tx = this.startTransaction();

		tx.$state.honba = (tx.$state.honba ?? 0) + 1;
		// 三家和・加槓ロン保留等の asking 残留を掃除し、次局待機へ進める。
		tx.$state.askings.ron = null;
		tx.$state.askings.pon = null;
		tx.$state.askings.cii = null;
		tx.$state.askings.kan = null;
		tx.$state.kakanRon = null;
		tx.$state.nextTurnAfterAsking = null;
		tx.$state.turn = null;
		tx.$state.drawnTile = null;

		tx.$commit();

		return {
			tenpaiHouses: [],
			notenHouses: ['e', 's', 'w', 'n'],
			pointDeltas: { e: 0, s: 0, w: 0, n: 0 },
			abortive: kind,
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
			matchLength: 'south',
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
			riichiTiles: {
				e: null,
				s: null,
				w: null,
				n: null,
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
			kakanRon: null,
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
			const newState = MasterGameEngine.createInitialState({ matchLength: tx.$state.matchLength ?? 'south' });
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
		// オーラス止め（和了止め）は実装しない。東風戦は東4局の親流れで、
		// 東南戦は南4局の親流れで単純終了する。東4局の親流れは東南戦のみ南入する。
		if (nextKyoku > 4) {
			const matchLength = tx.$state.matchLength ?? 'south';
			if (tx.$state.round !== 'e' || matchLength === 'east') {
				return { ended: true };
			}
			const newState = MasterGameEngine.createInitialState({ matchLength });
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

		const newState = MasterGameEngine.createInitialState({ matchLength: tx.$state.matchLength ?? 'south' });
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

		// 四風連打: 全家の河が各1枚かつ4枚とも同一風牌なら中斷する。
		// ポン・チー・大明槓は河から牌を取り除くため河枚数で除外できるが、
		// 暗槓・加槓は河を変えないため、カンの度に増えるドラ表示数（初期値1）でも初巡継続を確認する。
		// firstTurnFlags は打牌でも落ちるため、4打牌時点では全家真になりえず条件に使えない。
		if ((['e', 's', 'w', 'n'] as const).every(h => tx.$state.hoTiles[h].length === 1) &&
			tx.$state.activatedDorasCount === 1) {
			const first = $type(tx.$state.hoTiles.e[0]);
			if ((first === 'e' || first === 's' || first === 'w' || first === 'n') &&
				(['s', 'w', 'n'] as const).every(h => $type(tx.$state.hoTiles[h][0]) === first)) {
				throw new AbortiveDrawError('suufonrenda');
			}
		}

		if (tx.$state.riichis[house]) {
			tx.$state.ippatsus[house] = false;
		}

		if (riichi) {
			tx.$state.riichis[house] = true;
			tx.$state.riichiTiles[house] = tid;
			tx.$state.ippatsus[house] = true;
			if (tx.$state.firstTurnFlags[house]) {
				tx.$state.doubleRiichis[house] = true;
			}
			tx.$state.points[house] -= 1000;
			tx.$state.kyotaku = (tx.$state.kyotaku ?? 0) + 1;
			// 四家立直が成立したら中斷する。徴収済みの1000点も tx 破棄により供託に入らない（単純化）。
			if ((['e', 's', 'w', 'n'] as const).every(h => tx.$state.riichis[h])) {
				throw new AbortiveDrawError('suuchariichi');
			}
		}

		tx.$state.firstTurnFlags[house] = false;
		tx.$state.rinshanFlags[house] = false;
		tx.$state.drawnTile = null;

		const canRonHouses: House[] = [];
		switch (house) {
			case 'e':
				if (tx.canRon('s', tid, house)) canRonHouses.push('s');
				if (tx.canRon('w', tid, house)) canRonHouses.push('w');
				if (tx.canRon('n', tid, house)) canRonHouses.push('n');
				break;
			case 's':
				if (tx.canRon('e', tid, house)) canRonHouses.push('e');
				if (tx.canRon('w', tid, house)) canRonHouses.push('w');
				if (tx.canRon('n', tid, house)) canRonHouses.push('n');
				break;
			case 'w':
				if (tx.canRon('e', tid, house)) canRonHouses.push('e');
				if (tx.canRon('s', tid, house)) canRonHouses.push('s');
				if (tx.canRon('n', tid, house)) canRonHouses.push('n');
				break;
			case 'n':
				if (tx.canRon('e', tid, house)) canRonHouses.push('e');
				if (tx.canRon('s', tid, house)) canRonHouses.push('s');
				if (tx.canRon('w', tid, house)) canRonHouses.push('w');
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

		assertKanLimit(tx.$state);

		tx.clearFirstTurnAndIppatsus();

		tx.$state.activatedDorasCount++;

		// 槍槓のロン可否を判定するため、嶺上ツモの前に保留情報を立てる
		const kakanTile = $type(tid);
		tx.$state.kakanRon = { house, tile: kakanTile, tileId: tid };

		const canRonHouses = (['e', 's', 'w', 'n'] as const).filter(h => h !== house && tx.canRon(h, tid, house));

		if (canRonHouses.length > 0) {
			tx.$state.askings.ron = {
				callee: house,
				callers: canRonHouses,
			};
			tx.$state.turn = null;
			tx.$state.nextTurnAfterAsking = house;
			tx.$state.drawnTile = null;
			tx.$commit();

			return {
				asking: true as const,
				canRonHouses,
				canKanHouses: [] as House[],
				canPonHouses: [] as House[],
				canCiiHouse: null as House | null,
				tiles,
				from: pon.from,
			};
		}

		tx.$state.kakanRon = null;

		const rinsyan = tx.rinshanTsumo();

		tx.$commit();

		return {
			asking: false as const,
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

		assertKanLimit(tx.$state);

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
		const doraCount = Common.calcHoraDoraCount(handTiles, tx.$state.handTiles[house], huros, tx.doras, tx.uraDoras, tx.$state.riichis[house]);
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
			// 三家和: 権利者の中の勝者が3人以上なら点数計算前に中斷する。
			// 権利のない回答は件数に含めない。
			const winners = answers.ron.filter(h => ron.callers.includes(h));
			if (winners.length >= 3) throw new AbortiveDrawError('sanchaho');
			const callers = answers.ron;
			const callee = ron.callee;
			const kakanRon = tx.$state.kakanRon;
			const isKakanRon = kakanRon != null;
			const ronTileId = isKakanRon ? kakanRon.tileId : tx.$state.hoTiles[callee].at(-1)!;
			const ronTile = isKakanRon ? kakanRon.tile : $type(ronTileId);
			// 人和の前提 (局の最初の捨て牌) は河・初巡フラグで判定する。加槓時は宣言時にフラグ消去済みのため不成立になる。
			const renhou = isFirstDiscardRon(
				{ e: tx.$state.hoTiles.e.length, s: tx.$state.hoTiles.s.length, w: tx.$state.hoTiles.w.length, n: tx.$state.hoTiles.n.length },
				tx.$state.firstTurnFlags,
				tx.$state.turnCount,
				callee,
			);
			const yakus: { [K in House]?: YakuSet } = Object.fromEntries(callers.map(house => {
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
					chankan: isKakanRon,
					renhou,
				});
				const doraCount = Common.calcHoraDoraCount(handTiles, tx.$state.handTiles[house].concat([ronTileId]), huros, tx.doras, tx.uraDoras, tx.$state.riichis[house]);
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
			tx.$state.kakanRon = null;
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

			assertKanLimit(tx.$state);

			tx.clearFirstTurnAndIppatsus();

			tx.$state.activatedDorasCount++;

			tx.$state.turn = kanCaller;
			const rinsyan = tx.rinshanTsumo();

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
		} else if (tx.$state.kakanRon != null) {
			// 加槓ロンの全辞退: 嶺上ツモを行い加槓者の手番継続とする
			const pendingKakan = tx.$state.kakanRon;
			const kakanHouse = pendingKakan.house;
			tx.$state.kakanRon = null;
			tx.$state.turn = kakanHouse;
			tx.$state.nextTurnAfterAsking = null;
			// 宣言時に四開槓の判定済みだが、解決経路でも同条件を満たすことを確認する。
			assertKanLimit(tx.$state);
			const kakanRinsyan = tx.rinshanTsumo();
			const kakanHuro = tx.$state.huros[kakanHouse].find((h): h is Huro & { type: 'minkan' } => h.type === 'minkan' && (h as { kakan?: boolean }).kakan === true && h.tiles.includes(pendingKakan.tileId));
			if (kakanHuro == null) throw new Error('Kakan huro not found');
			tx.$commit();

			return {
				type: 'kakanRinshan' as const,
				house: kakanHouse,
				tiles: kakanHuro.tiles,
				from: kakanHuro.from,
				rinsyan: kakanRinsyan,
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
			riichiTiles: {
				e: this.$state.riichiTiles.e,
				s: this.$state.riichiTiles.s,
				w: this.$state.riichiTiles.w,
				n: this.$state.riichiTiles.n,
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
