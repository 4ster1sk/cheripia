/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert';
import { calcOwnedDoraCount, calcPoint, calcRedDoraCount, calcTsumoHoraPointDeltas, Huro, PointFactor } from '../src/common.js';

describe('Standard scoring', () => {
	const ronCases: { name: string; factor: PointFactor; isParent: boolean; expected: number }[] = [
		{ name: 'dealer 2 han 30 fu', factor: { isYakuman: false, fan: 2, fu: 30 }, isParent: true, expected: 2900 },
		{ name: 'child 2 han 40 fu', factor: { isYakuman: false, fan: 2, fu: 40 }, isParent: false, expected: 2600 },
		{ name: 'child 3 han 40 fu', factor: { isYakuman: false, fan: 3, fu: 40 }, isParent: false, expected: 5200 },
		{ name: 'dealer 3 han 30 fu', factor: { isYakuman: false, fan: 3, fu: 30 }, isParent: true, expected: 5800 },
		{ name: 'dealer 1 han 30 fu', factor: { isYakuman: false, fan: 1, fu: 30 }, isParent: true, expected: 1500 },
		{ name: 'child 1 han 40 fu', factor: { isYakuman: false, fan: 1, fu: 40 }, isParent: false, expected: 1300 },
		{ name: 'child 4 han 30 fu (no kiriage mangan)', factor: { isYakuman: false, fan: 4, fu: 30 }, isParent: false, expected: 7700 },
		{ name: 'child 3 han 60 fu (no kiriage mangan)', factor: { isYakuman: false, fan: 3, fu: 60 }, isParent: false, expected: 7700 },
		{ name: 'child 3 han 70 fu (mangan)', factor: { isYakuman: false, fan: 3, fu: 70 }, isParent: false, expected: 8000 },
		{ name: 'child 4 han 40 fu (mangan)', factor: { isYakuman: false, fan: 4, fu: 40 }, isParent: false, expected: 8000 },
		{ name: 'child 5 han (mangan)', factor: { isYakuman: false, fan: 5, fu: 30 }, isParent: false, expected: 8000 },
		{ name: 'child 6 han (haneman)', factor: { isYakuman: false, fan: 6, fu: 30 }, isParent: false, expected: 12000 },
		{ name: 'child 8 han (baiman)', factor: { isYakuman: false, fan: 8, fu: 30 }, isParent: false, expected: 16000 },
		{ name: 'child 11 han (sanbaiman)', factor: { isYakuman: false, fan: 11, fu: 30 }, isParent: false, expected: 24000 },
		{ name: 'child 13 han (yakuman)', factor: { isYakuman: false, fan: 13, fu: 30 }, isParent: false, expected: 32000 },
	];

	for (const { name, factor, isParent, expected } of ronCases) {
		it(`Ron: ${name} = ${expected}`, () => {
			assert.strictEqual(calcPoint(factor, isParent), expected);
		});
	}

	it('Adds dora count as additional han', () => {
		assert.strictEqual(calcPoint({ isYakuman: false, fan: 2, fu: 30 }, true, 1), 5800); // 3 han 30 fu
	});

	it('Yakuman ignores fu and dora', () => {
		assert.strictEqual(calcPoint({ isYakuman: true, value: 1 }, false), 32000);
		assert.strictEqual(calcPoint({ isYakuman: true, value: 1 }, true), 48000);
		assert.strictEqual(calcPoint({ isYakuman: true, value: 1 }, false, 13), 32000);
		assert.strictEqual(calcPoint({ isYakuman: true, value: 2 }, false), 64000);
	});

	describe('Tsumo', () => {
		it('Child 1 han 40 fu = 700/400 (1500 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('s', { isYakuman: false, fan: 1, fu: 40 }), {
				e: -700,
				s: 1500,
				w: -400,
				n: -400,
			});
		});

		it('Child 2 han 40 fu = 1300/700 (2700 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('s', { isYakuman: false, fan: 2, fu: 40 }), {
				e: -1300,
				s: 2700,
				w: -700,
				n: -700,
			});
		});

		it('Child 1 han 30 fu = 500/300 (1100 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('n', { isYakuman: false, fan: 1, fu: 30 }), {
				e: -500,
				s: -300,
				w: -300,
				n: 1100,
			});
		});

		it('Dealer 2 han 30 fu = 1000 all (3000 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('e', { isYakuman: false, fan: 2, fu: 30 }), {
				e: 3000,
				s: -1000,
				w: -1000,
				n: -1000,
			});
		});

		it('Dealer 3 han 30 fu = 2000 all (6000 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('e', { isYakuman: false, fan: 3, fu: 30 }), {
				e: 6000,
				s: -2000,
				w: -2000,
				n: -2000,
			});
		});

		it('Child 4 han 30 fu = 3900/2000 (7900 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('w', { isYakuman: false, fan: 4, fu: 30 }), {
				e: -3900,
				s: -2000,
				w: 7900,
				n: -2000,
			});
		});

		it('Yakuman dealer = 16000 all (48000 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('e', { isYakuman: true, value: 1 }), {
				e: 48000,
				s: -16000,
				w: -16000,
				n: -16000,
			});
		});

		it('Yakuman child = 16000/8000 (32000 total)', () => {
			assert.deepStrictEqual(calcTsumoHoraPointDeltas('s', { isYakuman: true, value: 1 }), {
				e: -16000,
				s: 32000,
				w: -8000,
				n: -8000,
			});
		});
	});
});

describe('calcOwnedDoraCount', () => {
	it('Counts dora in hand tiles', () => {
		assert.strictEqual(calcOwnedDoraCount(['m5', 'm5', 'p1'], [], ['m5']), 2);
	});

	it('Counts dora in cii tiles', () => {
		const huros: Huro[] = [
			{ type: 'cii', tiles: [17, 21, 25], from: 's' }, // m5, m6, m7
		];
		assert.strictEqual(calcOwnedDoraCount([], huros, ['m5']), 1);
	});

	it('Counts dora in pon, cii, minkan and ankan', () => {
		const huros: Huro[] = [
			{ type: 'pon', tiles: [17, 18, 19], from: 's' }, // m5 x3
			{ type: 'cii', tiles: [1, 5, 9], from: 's' }, // m1, m2, m3
			{ type: 'minkan', tiles: [53, 54, 55, 56], from: 's' }, // p5 x4
			{ type: 'ankan', tiles: [89, 90, 91, 92] }, // s5 x4
		];
		assert.strictEqual(calcOwnedDoraCount(['m5'], huros, ['m5', 'p5', 's5']), 12); // 1 + 3 + 0 + 4 + 4
	});

	it('Does not count non-dora meld tiles', () => {
		const huros: Huro[] = [
			{ type: 'pon', tiles: [17, 18, 19], from: 's' }, // m5 x3
			{ type: 'minkan', tiles: [53, 54, 55, 56], from: 's' }, // p5 x4
		];
		assert.strictEqual(calcOwnedDoraCount([], huros, ['m1', 'p1']), 0);
	});
});

describe('calcRedDoraCount', () => {
	it('Counts red dora in hand and huros', () => {
		const huros: Huro[] = [
			{ type: 'pon', tiles: [92, 89, 90], from: 's' }, // s5(red), s5, s5
		];
		assert.strictEqual(calcRedDoraCount([20, 56], huros), 3); // m5(red), p5(red), s5(red)
	});
});
