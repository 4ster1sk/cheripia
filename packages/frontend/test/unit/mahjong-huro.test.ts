/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/vue';
import * as Mmj from 'misskey-mahjong';
import XTile from '@/pages/mahjong/tile.vue';
import XHuro from '@/pages/mahjong/huro.vue';

function imgs(container: Element): HTMLImageElement[] {
	return Array.from(container.querySelectorAll('img'));
}

function backgroundImgs(container: Element): HTMLImageElement[] {
	return imgs(container).filter(img => img.getAttribute('src')?.includes('/mahjong/putted-tile-') ?? false);
}

function sidewaysBackgrounds(container: Element): HTMLImageElement[] {
	return backgroundImgs(container).filter(img => img.getAttribute('src') === '/client-assets/mahjong/putted-tile-3.png');
}

function uprightBackgrounds(container: Element): HTMLImageElement[] {
	return backgroundImgs(container).filter(img => img.getAttribute('src') === '/client-assets/mahjong/putted-tile-1.png');
}

function faceImgs(container: Element): HTMLImageElement[] {
	return imgs(container).filter(img => img.getAttribute('src')?.includes('/mahjong/tiles/') ?? false);
}

function renderHuro(huro: Mmj.Huro, caller: Mmj.House = 's') {
	return render(XHuro, {
		props: {
			huro,
			caller,
			doras: [],
		},
	});
}

afterEach(() => {
	cleanup();
});

describe('XTile', () => {
	test('faceDown renders only the tile background', () => {
		const { container } = render(XTile, {
			props: {
				tile: Mmj.findTileByIdOrFail(1),
				variation: '3',
				doras: [],
				faceDown: true,
			},
		});

		assert.strictEqual(backgroundImgs(container).length, 1);
		assert.strictEqual(backgroundImgs(container)[0].getAttribute('src'), '/client-assets/mahjong/putted-tile-3.png');
		assert.strictEqual(faceImgs(container).length, 0);
	});

	test('renders the tile face when faceDown is omitted', () => {
		const { container } = render(XTile, {
			props: {
				tile: Mmj.findTileByIdOrFail(20),
				variation: '3',
				doras: [],
			},
		});

		assert.strictEqual(backgroundImgs(container).length, 1);
		assert.strictEqual(faceImgs(container).length, 1);
		assert.strictEqual(faceImgs(container)[0].getAttribute('src'), '/client-assets/mahjong/tiles/m5r.png');
	});
});

describe('XHuro', () => {
	test('pon from kamicha lays the claimed tile sideways on the left', () => {
		const { container } = renderHuro({
			type: 'pon',
			tiles: [1, 2, 3],
			from: 'e',
		}, 's');

		assert.strictEqual(backgroundImgs(container).length, 3);
		assert.strictEqual(sidewaysBackgrounds(container).length, 1);
		assert.strictEqual(uprightBackgrounds(container).length, 2);
		assert.strictEqual(faceImgs(container).length, 3);
		// 鳴いた牌 (tiles[0] = m1) が左端に来る
		assert.strictEqual(faceImgs(container)[0].getAttribute('src'), '/client-assets/mahjong/tiles/m1.png');
	});

	test('pon from toimen lays the claimed tile sideways in the middle', () => {
		const { container } = renderHuro({
			type: 'pon',
			tiles: [1, 2, 3],
			from: 'n',
		}, 's');

		assert.strictEqual(sidewaysBackgrounds(container).length, 1);
		assert.strictEqual(uprightBackgrounds(container).length, 2);
		assert.strictEqual(faceImgs(container)[1].getAttribute('src'), '/client-assets/mahjong/tiles/m1.png');
	});

	test('pon from shimocha lays the claimed tile sideways on the right', () => {
		const { container } = renderHuro({
			type: 'pon',
			tiles: [1, 2, 3],
			from: 'w',
		}, 's');

		assert.strictEqual(sidewaysBackgrounds(container).length, 1);
		assert.strictEqual(uprightBackgrounds(container).length, 2);
		assert.strictEqual(faceImgs(container)[2].getAttribute('src'), '/client-assets/mahjong/tiles/m1.png');
	});

	test('shows the outer tiles of own ankan and hides the middle tiles', () => {
		const { container } = renderHuro({
			type: 'ankan',
			tiles: [1, 2, 3, 4],
		});

		assert.strictEqual(backgroundImgs(container).length, 4);
		assert.strictEqual(sidewaysBackgrounds(container).length, 0);
		const faces = faceImgs(container);
		assert.strictEqual(faces.length, 2);
		assert.deepStrictEqual(faces.map(img => img.getAttribute('src')), [
			'/client-assets/mahjong/tiles/m1.png',
			'/client-assets/mahjong/tiles/m1.png',
		]);
	});

	test('hides all tiles of another player\'s ankan', () => {
		const { container } = renderHuro({
			type: 'ankan',
			tiles: [0, 0, 0, 0],
		});

		assert.strictEqual(backgroundImgs(container).length, 4);
		assert.strictEqual(faceImgs(container).length, 0);
	});

	test('shows daiminkan with a single sideways tile', () => {
		const { container } = renderHuro({
			type: 'minkan',
			tiles: [1, 2, 3, 4],
			from: 'e',
		}, 's');

		assert.strictEqual(backgroundImgs(container).length, 4);
		assert.strictEqual(sidewaysBackgrounds(container).length, 1);
		assert.strictEqual(uprightBackgrounds(container).length, 3);
		assert.strictEqual(faceImgs(container).length, 4);
	});

	test('shows kakan with the pon display plus an upright added tile', () => {
		const { container } = renderHuro({
			type: 'minkan',
			tiles: [4, 1, 2, 3],
			from: 'e',
			kakan: true,
		}, 's');

		assert.strictEqual(backgroundImgs(container).length, 4);
		assert.strictEqual(sidewaysBackgrounds(container).length, 1);
		assert.strictEqual(uprightBackgrounds(container).length, 3);
		assert.strictEqual(faceImgs(container).length, 4);
		// 追加牌 (tiles[0]) は右端に立てて置く
		assert.strictEqual(faceImgs(container)[3].getAttribute('src'), '/client-assets/mahjong/tiles/m1.png');
	});

	test('shows cii with the claimed tile sideways', () => {
		for (const [pattern, index] of [['x__', 0], ['_x_', 1], ['__x', 2]] as const) {
			const { container } = renderHuro({
				type: 'cii',
				tiles: [1, 5, 9],
				from: 'e',
				pattern,
			}, 's');

			assert.strictEqual(backgroundImgs(container).length, 3);
			assert.strictEqual(sidewaysBackgrounds(container).length, 1);
			assert.strictEqual(uprightBackgrounds(container).length, 2);
			assert.strictEqual(faceImgs(container).length, 3);
			const backgrounds = backgroundImgs(container);
			assert.strictEqual(backgrounds[index].getAttribute('src'), '/client-assets/mahjong/putted-tile-3.png');
			cleanup();
		}
	});
});
