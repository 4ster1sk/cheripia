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

function faceImgs(container: Element): HTMLImageElement[] {
	return imgs(container).filter(img => img.getAttribute('src')?.includes('/mahjong/tiles/') ?? false);
}

function renderHuro(huro: Mmj.Huro) {
	return render(XHuro, {
		props: {
			huro,
			variation: '3',
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
	test('lays huro tiles flat', () => {
		const { container } = renderHuro({
			type: 'pon',
			tiles: [1, 5, 9],
			from: 'e',
		});

		const backgrounds = backgroundImgs(container);
		assert.strictEqual(backgrounds.length, 3);
		assert.ok(backgrounds.every(img => img.getAttribute('src') === '/client-assets/mahjong/putted-tile-3.png'));
		assert.strictEqual(faceImgs(container).length, 3);
	});

	test('shows the outer tiles of own ankan and hides the middle tiles', () => {
		const { container } = renderHuro({
			type: 'ankan',
			tiles: [1, 5, 9, 13],
		});

		assert.strictEqual(backgroundImgs(container).length, 4);
		const faces = faceImgs(container);
		assert.strictEqual(faces.length, 2);
		assert.deepStrictEqual(faces.map(img => img.getAttribute('src')), [
			'/client-assets/mahjong/tiles/m1.png',
			'/client-assets/mahjong/tiles/m4.png',
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

	test('shows all tiles of minkan', () => {
		const { container } = renderHuro({
			type: 'minkan',
			tiles: [1, 5, 9, 13],
			from: 'e',
		});

		assert.strictEqual(backgroundImgs(container).length, 4);
		assert.strictEqual(faceImgs(container).length, 4);
	});

	test('shows all tiles of cii', () => {
		const { container } = renderHuro({
			type: 'cii',
			tiles: [1, 5, 9],
			from: 'e',
		});

		assert.strictEqual(backgroundImgs(container).length, 3);
		assert.strictEqual(faceImgs(container).length, 3);
	});
});
