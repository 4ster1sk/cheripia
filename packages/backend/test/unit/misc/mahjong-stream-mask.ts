/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { buildRonnedHandTiles, maskAnkannedBodyForHouse } from '@/misc/mahjong-stream-mask.js';

describe('misc:mahjong-stream-mask', () => {
	test('自家の暗槓は実値をそのまま返す', () => {
		const body = { house: 'e' as const, tiles: [11, 12, 13, 14] as unknown as [number, number, number, number], rinsyan: 21, doraIndicateTiles: [31] };
		expect(maskAnkannedBodyForHouse(body, 'e')).toBe(body);
	});

	test('他家の暗槓は tiles と rinsyan をマスクする', () => {
		const body = { house: 'e' as const, tiles: [11, 12, 13, 14] as unknown as [number, number, number, number], rinsyan: 21, doraIndicateTiles: [31] };
		const masked = maskAnkannedBodyForHouse(body, 's');
		expect(masked.tiles).toEqual([0, 0, 0, 0]);
		expect(masked.rinsyan).toBe(0);
		expect(masked.doraIndicateTiles).toEqual([31]);
		expect(masked.house).toBe('e');
	});

	test('ronned は勝者のみ実手牌・非勝者は空にする', () => {
		const handTiles = { e: [1, 2], s: [3, 4], w: [5, 6], n: [7, 8] };
		expect(buildRonnedHandTiles(handTiles, ['s'])).toEqual({ e: [], s: [3, 4], w: [], n: [] });
	});

	test('ronned のダブロンは両勝者のみ実手牌にする', () => {
		const handTiles = { e: [1, 2], s: [3, 4], w: [5, 6], n: [7, 8] };
		expect(buildRonnedHandTiles(handTiles, ['e', 'w'])).toEqual({ e: [1, 2], s: [], w: [5, 6], n: [] });
	});
});
