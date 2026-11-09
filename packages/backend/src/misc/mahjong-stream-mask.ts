/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { House } from 'misskey-mahjong';

export function maskAnkannedBodyForHouse<T extends { house: House; tiles: unknown; rinsyan: unknown }>(body: T, myHouse: House | null): T {
	if (body.house === myHouse) return body;
	return { ...body, tiles: [0, 0, 0, 0], rinsyan: 0 };
}

export function buildRonnedHandTiles<T>(handTiles: Record<House, T[]>, callers: readonly House[]): Record<House, T[]> {
	return {
		e: callers.includes('e') ? handTiles.e : [],
		s: callers.includes('s') ? handTiles.s : [],
		w: callers.includes('w') ? handTiles.w : [],
		n: callers.includes('n') ? handTiles.n : [],
	};
}
