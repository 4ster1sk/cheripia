/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach, beforeAll } from 'vitest';
import { render, cleanup, type RenderResult } from '@testing-library/vue';
import type { SummalyResult } from '@misskey-dev/summaly';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkUrlPreview from '@/components/MkUrlPreview.vue';
import { instance } from '@/instance.js';

describe('MkUrlPreview', () => {
	beforeAll(() => {
		instance.urlPreviewEndpoint = '/url';
	});

	const renderPreviewBy = async (summary: Partial<SummalyResult>): Promise<RenderResult> => {
		if (!summary.player) {
			summary.player = {
				url: null,
				width: null,
				height: null,
				allow: [],
			};
		}

		fetchMock.mockOnceIf((req) => {
			const url = new URL(req.url);
			return url.pathname === '/url';
		}, () => {
			return {
				status: 200,
				body: JSON.stringify(summary),
			};
		});

		const result = render(MkUrlPreview, {
			props: { url: summary.url! },
			global: { directives, components },
		});

		await new Promise<void>(resolve => {
			const observer = new MutationObserver(() => {
				resolve();
				observer.disconnect();
			});
			observer.observe(result.container, { childList: true, subtree: true });
		});

		return result;
	};

	const renderAndOpenPreview = async (summary: Partial<SummalyResult>): Promise<HTMLIFrameElement | null> => {
		const mkUrlPreview = await renderPreviewBy(summary);
		const buttons = mkUrlPreview.getAllByRole('button');
		buttons[0].click();
		// Wait for the click event to be fired
		await Promise.resolve();

		return mkUrlPreview.container.querySelector('iframe');
	};

	afterEach(() => {
		fetchMock.resetMocks();
		cleanup();
	});

	test('Should render the description', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			description: 'Mocked description',
		});
		mkUrlPreview.getByText('Mocked description');
	});

	test('Having a player should render a button', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		const buttons = mkUrlPreview.getAllByRole('button');
		assert.strictEqual(buttons.length, 2, 'two buttons');
	});

	test('Having a player should setup the iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.src, 'https://example.local/player?autoplay=1&auto_play=1');
		assert.strictEqual(
			iframe?.sandbox.toString(),
			'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-storage-access-by-user-activation allow-same-origin',
		);
	});

	test('Having a player with `allow` field should set permissions', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['fullscreen', 'web-share'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'fullscreen;web-share');
	});

	test('A Summaly proxy response without allow falls back to the default', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: undefined as any,
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;encrypted-media;fullscreen');
	});

	test('Filtering the allow list from the Summaly proxy', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['autoplay', 'camera', 'fullscreen'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;fullscreen');
	});

	test('Having a player width should keep the fixed aspect ratio', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: 400,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '50%');
	});

	test('Having a player width should keep the fixed height', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '200px');
	});

	test('Loading a tweet in iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://twitter.com/i/web/status/1685072521782325249',
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.getAttribute('allow'), 'fullscreen;web-share');
		assert.strictEqual(iframe?.getAttribute('sandbox'), 'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin');
	});

	test('Loading a post in iframe', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://x.com/i/web/status/1685072521782325249',
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.getAttribute('allow'), 'fullscreen;web-share');
		assert.strictEqual(iframe?.getAttribute('sandbox'), 'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin');
	});

	// Cheripia: Bluesky埋め込み入力バリデーションのリグレッションテスト
	test('bsky: 不正な文字を含むプロフィールURLでは展開ボタンを表示しない', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://bsky.app/profile/ali%20ce.example/post/3jqabcdefg2hij',
		});
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(mkUrlPreview.queryAllByRole('button').length, 0, 'invalid handle should not render an expand button');
	});

	test('bsky: resolveHandle失敗時は展開ボタンが非表示になり再fetchしない', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://bsky.app/profile/alice.example/post/3jqabcdefg2hij',
		});
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).hostname === 'public.api.bsky.app',
			{ status: 400, body: JSON.stringify({ error: 'InvalidRequest', message: 'Unable to find profile' }) },
		);
		const buttons = mkUrlPreview.getAllByRole('button');
		assert.strictEqual(buttons.length, 1, 'valid handle should render an expand button');
		buttons[0].click();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(mkUrlPreview.queryAllByRole('button').length, 0, 'button should be hidden after resolution failure');
		const resolveHandleCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('resolveHandle'));
		assert.strictEqual(resolveHandleCalls.length, 1, 'no retry fetch after failure');
	});

	test('bsky: 一時的な解決失敗後、再度クリックするとハンドルが再取得される', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://bsky.app/profile/alice.example/post/3jqabcdefg2hij',
		});
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).hostname === 'public.api.bsky.app',
			{ status: 503, body: 'Service Unavailable' },
		);
		mkUrlPreview.getAllByRole('button')[0].click();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(mkUrlPreview.getAllByRole('button').length, 1, 'button should stay visible after a transient failure');

		fetchMock.mockOnceIf(
			(req) => new URL(req.url).hostname === 'public.api.bsky.app',
			{ status: 200, body: JSON.stringify({ did: 'did:plc:abc123def456' }) },
		);
		mkUrlPreview.getAllByRole('button')[0].click();
		await new Promise(resolve => setTimeout(resolve, 0));
		const iframe = mkUrlPreview.container.querySelector('iframe');
		assert.exists(iframe, 'iframe should exist after retry');
		assert.ok(String(iframe?.src).startsWith('https://embed.bsky.app/embed/did:plc:abc123def456/app.bsky.feed.post/3jqabcdefg2hij?id='), `unexpected iframe src: ${iframe?.src}`);
		const resolveHandleCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('resolveHandle'));
		assert.strictEqual(resolveHandleCalls.length, 2, 'retry should refetch the handle');
	});

	test('bsky: 通信エラー後も展開ボタンが残り再試行できる', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://bsky.app/profile/alice.example/post/3jqabcdefg2hij',
		});
		fetchMock.mockOnceIf(
			(req) => new URL(req.url).hostname === 'public.api.bsky.app',
			() => {
				throw new Error('network error');
			},
		);
		mkUrlPreview.getAllByRole('button')[0].click();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(mkUrlPreview.getAllByRole('button').length, 1, 'button should stay visible after a network error');
	});

	test('bsky: didプロフィールはresolveHandleを介さずiframeが生成される', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://bsky.app/profile/did:plc:abc123def456/post/3jqabcdefg2hij',
		});
		assert.exists(iframe, 'iframe should exist');
		assert.ok(String(iframe?.src).startsWith('https://embed.bsky.app/embed/did:plc:abc123def456/app.bsky.feed.post/3jqabcdefg2hij?id='), `unexpected iframe src: ${iframe?.src}`);
		const resolveHandleCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('resolveHandle'));
		assert.strictEqual(resolveHandleCalls.length, 0, 'did path should not call resolveHandle');
	});
});
