/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert';
import { calcFu, calcWaitPatterns } from '../src/common.fu';
import { analyzeFourMentsuOneJyantou, Huro, TileType } from '../src/common';

describe('Fu', () => {
	describe('Wait patterns', () => {
		it('Ryanmen', () => {
			const fourMentsuOneJyantou = analyzeFourMentsuOneJyantou(
				['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 'p5', 'p6', 'p7', 's1', 's1', 's7', 's8', 's9'],
			)[0];
			assert.deepStrictEqual(calcWaitPatterns(fourMentsuOneJyantou, 's9'), [{
				...fourMentsuOneJyantou,
				waitedFor: 'mentsu',
				agariTile: 's9',
				waitedTaatsu: ['s7', 's8'],
			}]);
		});

		it('Kanchan', () => {
			const fourMentsuOneJyantou = analyzeFourMentsuOneJyantou(
				['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 'p5', 'p6', 'p7', 's1', 's1', 's7', 's8', 's9'],
			)[0];
			assert.deepStrictEqual(calcWaitPatterns(fourMentsuOneJyantou, 's8'), [{
				...fourMentsuOneJyantou,
				waitedFor: 'mentsu',
				agariTile: 's8',
				waitedTaatsu: ['s7', 's9'],
			}]);
		});

		it('Penchan', () => {
			const fourMentsuOneJyantou = analyzeFourMentsuOneJyantou(
				['m2', 'm3', 'm4', 'p6', 'p7', 'p8', 'p5', 'p6', 'p7', 's1', 's1', 's7', 's8', 's9'],
			)[0];
			assert.deepStrictEqual(calcWaitPatterns(fourMentsuOneJyantou, 's7'), [{
				...fourMentsuOneJyantou,
				waitedFor: 'mentsu',
				agariTile: 's7',
				waitedTaatsu: ['s8', 's9'],
			}]);
		});

		it('Tanki', () => {
			const fourMentsuOneJyantou = analyzeFourMentsuOneJyantou(
				['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'haku', 'haku', 'haku', 'e', 'e'],
			)[0];
			assert.deepStrictEqual(calcWaitPatterns(fourMentsuOneJyantou, 'e'), [{
				...fourMentsuOneJyantou,
				waitedFor: 'head',
				agariTile: 'e',
			}]);
		});

		it('Nobetan', () => {
			const fourMentsuOneJyantou = analyzeFourMentsuOneJyantou(
				['m1', 'm2', 'm3', 'm5', 'm6', 'm7', 'p2', 'p3', 'p4', 's3', 's4', 's5', 's6', 's6'],
			)[0];
			assert.deepStrictEqual(calcWaitPatterns(fourMentsuOneJyantou, 's6'), [{
				...fourMentsuOneJyantou,
				waitedFor: 'head',
				agariTile: 's6',
			}]);
		});
	});

	describe('calcFu', () => {
		const pinfuHand: TileType[] = ['m1', 'm2', 'm3', 'p3', 'p4', 'p5', 's6', 's7', 's8', 'p7', 'p8', 'p9', 's2', 's2'];

		it('Pinfu tsumo is 20 fu and pinfu ron is 30 fu', () => {
			assert.strictEqual(calcFu({
				handTiles: pinfuHand,
				huros: [],
				agariTile: 'p9',
				isTsumo: true,
				seatWind: 's',
				fieldWind: 'e',
				yakuNames: ['tsumo', 'pinfu'],
			}), 20);

			assert.strictEqual(calcFu({
				handTiles: pinfuHand,
				huros: [],
				agariTile: 'p9',
				isTsumo: false,
				seatWind: 's',
				fieldWind: 'e',
				yakuNames: ['pinfu'],
			}), 30);
		});

		it('Chiitoitsu is 25 fu', () => {
			const handTiles: TileType[] = ['m1', 'm1', 'm2', 'm2', 'p3', 'p3', 'p4', 'p4', 's5', 's5', 's6', 's6', 'e', 'e'];
			assert.strictEqual(calcFu({
				handTiles,
				huros: [],
				agariTile: 'e',
				isTsumo: true,
				seatWind: 's',
				fieldWind: 'e',
				yakuNames: ['tsumo', 'chitoitsu'],
			}), 25);
			assert.strictEqual(calcFu({
				handTiles,
				huros: [],
				agariTile: 'e',
				isTsumo: false,
				seatWind: 's',
				fieldWind: 'e',
				yakuNames: ['chitoitsu'],
			}), 25);
		});

		it('Closed ron with concealed triplets and tanki wait', () => {
			const handTiles: TileType[] = ['m1', 'm2', 'm3', 'p6', 'p6', 'p6', 's6', 's7', 's8', 'n', 'n', 'n', 'm3', 'm3'];
			assert.strictEqual(calcFu({
				handTiles,
				huros: [],
				agariTile: 'm3',
				isTsumo: false,
				seatWind: 'e',
				fieldWind: 'e',
				yakuNames: ['double-riichi', 'hotei'],
			}), 50); // 20 + 10(門前ロン) + 4(中張暗刻) + 8(字牌暗刻) + 2(単騎)
		});

		it('A triplet completed by ron is treated as an open triplet', () => {
			const handTiles: TileType[] = ['m2', 'm2', 'm2', 'p3', 'p4', 'p5', 's6', 's7', 's8', 'p7', 'p8', 'p9', 's2', 's2'];
			const base = {
				handTiles,
				huros: [],
				agariTile: 'm2' as const,
				seatWind: 's' as const,
				fieldWind: 'e' as const,
				yakuNames: ['riichi'],
			};
			assert.strictEqual(calcFu({ ...base, isTsumo: false }), 40); // 20 + 10 + 2(明刻扱い)
			assert.strictEqual(calcFu({ ...base, isTsumo: true }), 30); // 20 + 2 + 4(暗刻)
		});

		it('Counts fu of every huro type', () => {
			const handTiles: TileType[] = ['haku', 'haku'];
			const huros: Huro[] = [
				{ type: 'cii', tiles: [1, 5, 9], from: 's' },
				{ type: 'pon', tiles: [57, 58, 59], from: 's' },
				{ type: 'minkan', tiles: [105, 106, 107, 108], from: 's' },
				{ type: 'ankan', tiles: [121, 122, 123, 124] },
			];
			const base = {
				handTiles,
				huros,
				agariTile: 'haku' as const,
				seatWind: 'e' as const,
				fieldWind: 'e' as const,
				yakuNames: ['tsumo'],
			};
			// 20 + 2(ツモ) + 2(役牌雀頭) + 2(中張明刻) + 16(老頭明槓) + 32(字牌暗槓) + 2(単騎)
			assert.strictEqual(calcFu({ ...base, isTsumo: true }), 80);
			assert.strictEqual(calcFu({ ...base, isTsumo: false }), 80);
		});

		it('Double wind head is 4 fu', () => {
			const handTiles: TileType[] = ['m2', 'm2', 'm2', 'p6', 'p6', 'p6', 's3', 's4', 's5', 'p7', 'p8', 'p9', 'e', 'e'];
			const base = {
				handTiles,
				huros: [],
				agariTile: 'p9' as const,
				isTsumo: false,
				seatWind: 'e' as const,
				yakuNames: ['riichi'],
			};
			assert.strictEqual(calcFu({ ...base, fieldWind: 'e' }), 50); // 20 + 10 + 4 + 4 + 4(連風牌)
			assert.strictEqual(calcFu({ ...base, fieldWind: 's' }), 40); // 20 + 10 + 4 + 4 + 2(自風)
		});

		it('Calculates wait fu', () => {
			const base = {
				handTiles: pinfuHand,
				huros: [] as Huro[],
				isTsumo: false,
				seatWind: 's' as const,
				fieldWind: 'e' as const,
				yakuNames: ['riichi'],
			};
			assert.strictEqual(calcFu({ ...base, agariTile: 'p9' }), 30); // 両面
			assert.strictEqual(calcFu({ ...base, agariTile: 'p8' }), 40); // 嵌張
			assert.strictEqual(calcFu({ ...base, agariTile: 'm2' }), 40); // 嵌張
			assert.strictEqual(calcFu({ ...base, agariTile: 'm3' }), 40); // 辺張
			assert.strictEqual(calcFu({ ...base, agariTile: 's2' }), 40); // 単騎
		});

		it('Takes the maximum fu over multiple decompositions', () => {
			const handTiles: TileType[] = ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'p4', 'p5', 'p6', 's7', 's7'];
			// 刻子: 20 + 10(門前ロン) + 4(幺九の明刻扱い) + 4 + 4 = 42 → 50
			// 順子: 20 + 10 = 30
			assert.strictEqual(calcFu({
				handTiles,
				huros: [],
				agariTile: 'm1',
				isTsumo: false,
				seatWind: 's',
				fieldWind: 'e',
				yakuNames: ['riichi'],
			}), 50);
		});
	});
});
