/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CALL_HURO_TYPES, FourMentsuOneJyantou, House, Huro, TILE_NUMBER_MAP, TILE_TYPES, TileType, YAOCHU_TILES, findTileByIdOrFail, includes, mentsuEquals } from './common.js';

export type Shape = 'fourMentsuOneJyantou' | 'chitoitsu' | 'kokushi';

/**
 * 4面子1雀頭と待ちに関わる部分
 */
export type FourMentsuOneJyantouWithWait = FourMentsuOneJyantou & {
	agariTile: TileType;
} & ({
	waitedFor: 'head';
} | {
	waitedFor: 'mentsu';
	waitedTaatsu: [TileType, TileType];
});

export function calcWaitPatterns(fourMentsuOneJyantou: FourMentsuOneJyantou | null, agariTile: TileType): FourMentsuOneJyantouWithWait[] | [null] {
	if (fourMentsuOneJyantou == null) return [null];

	const result: FourMentsuOneJyantouWithWait[] = [];

	if (fourMentsuOneJyantou.head === agariTile) {
		result.push({
			head: fourMentsuOneJyantou.head,
			mentsus: fourMentsuOneJyantou.mentsus,
			waitedFor: 'head',
			agariTile,
		});
	}

	const checkedMentsus: [TileType, TileType, TileType][] = [];
	for (const mentsu of fourMentsuOneJyantou.mentsus) {
		if (checkedMentsus.some(checkedMentsu => mentsuEquals(mentsu, checkedMentsu))) continue;
		const agariTileIndex = mentsu.indexOf(agariTile);
		if (agariTileIndex < 0) continue;
		result.push({
			head: fourMentsuOneJyantou.head,
			mentsus: fourMentsuOneJyantou.mentsus,
			waitedFor: 'mentsu',
			agariTile,
			waitedTaatsu: mentsu.toSpliced(agariTileIndex, 1) as [TileType, TileType],
		});
		checkedMentsus.push(mentsu);
	}

	return result;
}

export function isRyanmen(taatsu: [TileType, TileType]): boolean {
	const number1 = TILE_NUMBER_MAP[taatsu[0]];
	const number2 = TILE_NUMBER_MAP[taatsu[1]];
	if (number1 == null || number2 == null) return false;
	return number1 !== 1 && number2 !== 9 && number1 + 1 === number2;
}

export function isToitsu(taatsu: [TileType, TileType]): boolean {
	return taatsu[0] === taatsu[1];
}

type Mentsu = [TileType, TileType, TileType];

type Decomposition = {
	head: TileType;
	mentsus: Mentsu[];
};

export type FuCalcEnv = {
	/**
	 * 和了牌を含む手牌(副露牌は含まない)
	 */
	handTiles: TileType[];

	/**
	 * 副露
	 */
	huros: Huro[];

	/**
	 * 和了牌
	 */
	agariTile: TileType;

	/**
	 * ツモ和了かどうか
	 */
	isTsumo: boolean;

	/**
	 * 自風
	 */
	seatWind: House;

	/**
	 * 場風
	 */
	fieldWind: House;

	/**
	 * 成立した役の名前
	 */
	yakuNames: readonly string[];

	/**
	 * 役満かどうか(役満は符を問わない)
	 */
	isYakuman?: boolean;
};

function isDragon(tile: TileType): boolean {
	return tile === 'haku' || tile === 'hatsu' || tile === 'chun';
}

function isWind(tile: TileType): boolean {
	return tile === 'e' || tile === 's' || tile === 'w' || tile === 'n';
}

function isYaochu(tile: TileType): boolean {
	return includes(YAOCHU_TILES, tile);
}

/**
 * 手牌を「4面子1雀頭」に分解する。
 * 複数の分解があり得るため、全ての分解を列挙する。
 */
function decomposeHand(handTiles: TileType[], mentsuCount: number): Decomposition[] {
	const countMap = new Map<TileType, number>();
	for (const tile of handTiles) {
		countMap.set(tile, (countMap.get(tile) ?? 0) + 1);
	}

	const counts = TILE_TYPES.map(tile => countMap.get(tile) ?? 0);
	const decompositions: Decomposition[] = [];

	for (let headIndex = 0; headIndex < TILE_TYPES.length; headIndex++) {
		if (counts[headIndex] < 2) continue;

		counts[headIndex] -= 2;

		const build = (mentsus: Mentsu[]) => {
			if (mentsus.length === mentsuCount) {
				// 牌が余っている分解は不正
				if (counts.every(count => count === 0)) {
					decompositions.push({
						head: TILE_TYPES[headIndex],
						mentsus: [...mentsus],
					});
				}
				return;
			}

			const first = counts.findIndex(count => count > 0);
			if (first === -1) return;

			// 刻子
			if (counts[first] >= 3) {
				counts[first] -= 3;
				build([...mentsus, [TILE_TYPES[first], TILE_TYPES[first], TILE_TYPES[first]]]);
				counts[first] += 3;
			}

			// 順子
			const number = TILE_NUMBER_MAP[TILE_TYPES[first]];
			if (number != null && number <= 7 && counts[first + 1] > 0 && counts[first + 2] > 0) {
				counts[first]--;
				counts[first + 1]--;
				counts[first + 2]--;
				build([...mentsus, [TILE_TYPES[first], TILE_TYPES[first + 1], TILE_TYPES[first + 2]]]);
				counts[first]++;
				counts[first + 1]++;
				counts[first + 2]++;
			}
		};

		build([]);

		counts[headIndex] += 2;
	}

	return decompositions;
}

/**
 * 待ちの符を返す。複数の解釈がある場合は最も高い符を採用する。
 */
function calcWaitFu(decomposition: Decomposition, agariTile: TileType): number {
	if (decomposition.head === agariTile) return 2; // 単騎

	let fu = 0;
	for (const mentsu of decomposition.mentsus) {
		if (mentsu[0] === mentsu[1]) continue; // 刻子は双碰待ち(0符)

		const index = mentsu.indexOf(agariTile);
		if (index === -1) continue;

		if (index === 1) {
			// 嵌張
			fu = Math.max(fu, 2);
			continue;
		}

		const number = TILE_NUMBER_MAP[mentsu[0]];
		if ((number === 1 && index === 2) || (number === 7 && index === 0)) {
			// 辺張 (123 の 3 / 789 の 7)
			fu = Math.max(fu, 2);
		}
	}

	return fu;
}

function calcFuForDecomposition(
	env: FuCalcEnv,
	decomposition: Decomposition,
	isMenzen: boolean,
): number {
	let fu = 20;

	if (env.isTsumo) {
		fu += 2;
	} else if (isMenzen) {
		fu += 10;
	}

	// 雀頭
	const head = decomposition.head;
	if (isDragon(head)) fu += 2;
	if (isWind(head)) {
		if (head === env.seatWind) fu += 2;
		if (head === env.fieldWind) fu += 2;
	}

	// 手牌内の面子
	for (const mentsu of decomposition.mentsus) {
		if (mentsu[0] !== mentsu[1]) continue; // 順子

		// ロンで完成した刻子は明刻として扱う
		const isRonCompleted = !env.isTsumo && mentsu.includes(env.agariTile);
		if (isRonCompleted) {
			fu += isYaochu(mentsu[0]) ? 4 : 2;
		} else {
			fu += isYaochu(mentsu[0]) ? 8 : 4;
		}
	}

	// 副露
	for (const huro of env.huros) {
		const tile = findTileByIdOrFail(huro.tiles[0]).t;
		switch (huro.type) {
			case 'pon':
				fu += isYaochu(tile) ? 4 : 2;
				break;
			case 'minkan':
				fu += isYaochu(tile) ? 16 : 8;
				break;
			case 'ankan':
				fu += isYaochu(tile) ? 32 : 16;
				break;
			case 'cii':
				break;
		}
	}

	// 待ち
	fu += calcWaitFu(decomposition, env.agariTile);

	// 開き手および門前ロンは30符以上
	if (!isMenzen || !env.isTsumo) fu = Math.max(fu, 30);

	// 切り上げ
	return Math.ceil(fu / 10) * 10;
}

/**
 * 標準的な符計算を行う。
 * 平和ツモは20符、平和ロンは30符、七対子は25符。
 */
export function calcFu(env: FuCalcEnv): number {
	if (env.isYakuman) return 0;

	if (env.yakuNames.includes('chitoitsu')) return 25;
	if (env.yakuNames.includes('pinfu')) return env.isTsumo ? 20 : 30;

	const isMenzen = !env.huros.some(huro => includes(CALL_HURO_TYPES, huro.type));
	const mentsuCount = 4 - env.huros.length;
	const decompositions = decomposeHand(env.handTiles, mentsuCount);

	// 不正な手牌などで分解できなかった場合のフォールバック
	if (decompositions.length === 0) return 30;

	let maxFu = 0;
	for (const decomposition of decompositions) {
		maxFu = Math.max(maxFu, calcFuForDecomposition(env, decomposition, isMenzen));
	}

	return maxFu;
}
