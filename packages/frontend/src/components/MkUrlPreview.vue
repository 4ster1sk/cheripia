<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<template v-if="player.url && playerEnabled">
	<div
		:class="$style.player"
		:style="player.width ? `padding: ${(player.height || 0) / player.width * 100}% 0 0` : `padding: ${(player.height || 0)}px 0 0`"
	>
		<iframe
			v-if="player.url.startsWith('http://') || player.url.startsWith('https://')"
			sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-storage-access-by-user-activation allow-same-origin"
			scrolling="no"
			:allow="player.allow == null ? 'autoplay;encrypted-media;fullscreen' : player.allow.filter(x => ['autoplay', 'clipboard-write', 'fullscreen', 'encrypted-media', 'picture-in-picture', 'web-share'].includes(x)).join(';')"
			:class="$style.playerIframe"
			:src="transformPlayerUrl(player.url)"
			:style="{ border: 0 }"
		></iframe>
		<span v-else>invalid url</span>
	</div>
	<div :class="$style.action">
		<MkButton :small="true" inline @click.stop="playerEnabled = false">
			<i class="ti ti-x"></i> {{ i18n.ts.disablePlayer }}
		</MkButton>
	</div>
</template>
<template v-else-if="tweetId && tweetExpanded">
	<div ref="twitter">
		<iframe
			ref="tweet"
			allow="fullscreen;web-share"
			sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
			scrolling="no"
			:style="{ position: 'relative', width: '100%', height: `${tweetHeight}px`, border: 0 }"
			:src="`https://platform.twitter.com/embed/index.html?embedId=${embedId}&amp;hideCard=false&amp;hideThread=false&amp;lang=en&amp;theme=${store.s.darkMode ? 'dark' : 'light'}&amp;id=${tweetId}`"
		></iframe>
	</div>
	<div :class="$style.action">
		<MkButton :small="true" inline @click.stop="setTweetExpanded(false)">
			<i class="ti ti-x"></i> {{ i18n.ts.close }}
		</MkButton>
	</div>
</template>
<template v-else-if="bskyDid && bskyPostRecordKey && bskyExpanded">
	<div>
		<iframe
			allow="fullscreen;web-share"
			sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
			scrolling="no"
			:style="{ position: 'relative', width: '100%', height: `${bskyHeight}px`, border: 0 }"
			:src="`https://embed.bsky.app/embed/${bskyDid}/app.bsky.feed.post/${bskyPostRecordKey}?id=${embedId}`"
		></iframe>
	</div>
	<div :class="$style.action">
		<MkButton :small="true" inline @click.stop="setBskyExpanded(false)">
			<i class="ti ti-x"></i> {{ i18n.ts.close }}
		</MkButton>
	</div>
</template>
<div v-else>
	<component :is="self ? 'MkA' : 'a'" :class="[$style.link, { [$style.compact]: compact }]" :[attr]="self ? url_string.substring(local.length) : url_string" rel="nofollow noopener" :target="target" :title="url_string" @click.stop="(ev: MouseEvent) => warningExternalWebsite(ev, url_string)">
		<div v-if="thumbnail && !sensitive" :class="[$style.thumbnail, { [$style.thumbnailBlur]: sensitive }]" :style="prefer.r.dataSaver.value.urlPreviewThumbnail ? '' : `background-image: url('${thumbnail}')`">
		</div>
		<article :class="$style.body">
			<header :class="$style.header">
				<h1 v-if="unknownUrl" :class="$style.title">{{ url_string }}</h1>
				<h1 v-else-if="fetching" :class="$style.title"><MkEllipsis/></h1>
				<h1 v-else :class="$style.title" :title="title ?? undefined">{{ title }}</h1>
			</header>
			<p v-if="unknownUrl" :class="$style.text">{{ i18n.ts.failedToPreviewUrl }}</p>
			<p v-else-if="fetching" :class="$style.text"><MkEllipsis/></p>
			<p v-else-if="description" :class="$style.text" :title="description">{{ description.length > 85 ? description.slice(0, 85) + '…' : description }}</p>
			<footer :class="$style.footer">
				<img v-if="icon" :class="$style.siteIcon" :src="icon"/>
				<p v-if="unknownUrl" :class="$style.siteName">{{ requestUrl.host }}</p>
				<p v-else-if="fetching" :class="$style.siteName"><MkEllipsis/></p>
				<p v-else :class="$style.siteName" :title="sitename ?? requestUrl.host">{{ sitename ?? requestUrl.host }}</p>
			</footer>
		</article>
	</component>
	<template v-if="showActions">
		<div v-if="tweetId" :class="$style.action">
			<MkButton :small="true" inline @click.stop="setTweetExpanded(true)">
				<i class="ti ti-brand-x"></i> {{ i18n.ts.expandPost }}
			</MkButton>
		</div>
		<div v-if="bskyPostRecordKey && !bskyEmbedUnavailable" :class="$style.action">
			<MkButton :small="true" inline @click.stop="setBskyExpanded(true)">
				<i class="ti ti-brand-bluesky"></i> {{ i18n.ts.expandPost }}
			</MkButton>
		</div>
		<div v-if="!playerEnabled && player.url" :class="$style.action">
			<MkButton :small="true" inline @click.stop="playerEnabled = true">
				<i class="ti ti-player-play"></i> {{ i18n.ts.enablePlayer }}
			</MkButton>
			<MkButton v-if="!isMobile" :small="true" inline @click.stop="openPlayer()">
				<i class="ti ti-picture-in-picture"></i> {{ i18n.ts.openInWindow }}
			</MkButton>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onActivated, onDeactivated, onUnmounted, ref } from 'vue';
import { url as local } from '@@/js/config.js';
import { versatileLang } from '@@/js/intl-const.js';
import { maybeMakeRelative } from '@@/js/url.js';
import type { SummalyResult } from '@misskey-dev/summaly';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { deviceKind } from '@/utility/device-kind.js';
import MkButton from '@/components/MkButton.vue';
import { transformPlayerUrl } from '@/utility/url-preview.js';
import { store } from '@/store.js';
import { prefer } from '@/preferences.js';
import { warningExternalWebsite } from '@/utility/warning-external-website.js';
import { instance } from '@/instance.js';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy.js';

const props = withDefaults(defineProps<{
	url: string;
	detail?: boolean;
	compact?: boolean;
	showActions?: boolean;
	host?: string | null | undefined;
}>(), {
	detail: false,
	compact: false,
	showActions: true,
	host: null,
});

const MOBILE_THRESHOLD = 500;
const isMobile = ref(deviceKind === 'smartphone' || window.innerWidth <= MOBILE_THRESHOLD);

const maybeRelativeUrl = maybeMakeRelative(props.url, local);
let self = maybeRelativeUrl !== props.url;

// このインスタンスのクリップおよび再生URLでは、@サフィックス付きのパスを有効なURLとして扱います。
let requestUrl = new URL(props.url, window.location.href);
let url_string: string;
if (props.host === requestUrl.host && (requestUrl.pathname.startsWith('/clips/') || requestUrl.pathname.startsWith('/play/'))) {
	const split = requestUrl.pathname.split('@');
	requestUrl = new URL(local + split[0] + '@' + (split.length >= 2 ? split[1] : props.host));
	self = true;
	url_string = requestUrl.toString();
	requestUrl = new URL(props.url, window.location.href);
} else {
	url_string = requestUrl.toString();
}

const attr = self ? 'to' : 'href';
const target = self ? null : '_blank';
const fetching = ref(true);
const summalyResult = ref<SummalyResult | null>(null);
const title = computed(() => summalyResult.value?.title ?? null);
const description = computed(() => summalyResult.value?.description ?? null);
const thumbnail = computed(() => summalyResult.value?.thumbnail ?? null);
const icon = computed(() => summalyResult.value?.icon ?? null);
const sitename = computed(() => summalyResult.value?.sitename ?? null);
const sensitive = computed(() => summalyResult.value?.sensitive ?? false);
const player = computed(() => summalyResult.value?.player ?? { url: null, width: null, height: null });
const playerEnabled = ref(false); // 初期値はsummaly取り終わったあとに設定
const tweetId = ref<string | null>(null);
const tweetExpanded = ref(false); // 初期値はsummaly取り終わったあとに設定
let tweetExpandedByUser = false;
const embedId = `embed${Math.random().toString().replace(/\D/, '')}`;
const tweetHeight = ref(150);
const unknownUrl = ref(false);
let isDeactivated = false;

// CherryPick: Bluesky投稿の埋め込み。アップストリームの変更をクリーンにマージできるよう、状態をアップストリームのツイート埋め込みとは別に管理しています。
const bskyHandleOrDid = ref<string | null>(null);
const bskyDid = ref<string | null>(null);
let bskyDidResolving = false;
const bskyPostRecordKey = ref<string | null>(null);
const bskyExpanded = ref(false);
const bskyHeight = ref(150);
let bskyExpandedByUser = false;
// Cheripia: Bluesky埋め込みの恒久的な解決失敗を記録するステート
const bskyEmbedUnavailable = ref(false);

onActivated(() => {
	isDeactivated = false;
});

onDeactivated(() => {
	isDeactivated = true;
	playerEnabled.value = false;
});

if (!['http:', 'https:'].includes(requestUrl.protocol)) throw new Error('invalid url');

if (requestUrl.hostname === 'twitter.com' || requestUrl.hostname === 'mobile.twitter.com' || requestUrl.hostname === 'x.com' || requestUrl.hostname === 'mobile.x.com') {
	const m = requestUrl.pathname.match(/^\/.+\/status(?:es)?\/(\d+)/);
	if (m) tweetId.value = m[1];
}

if (requestUrl.hostname === 'bsky.app') {
	const bskyPostPageUrl = requestUrl.pathname.slice(1).split('/');
	if (bskyPostPageUrl[0] === 'profile' && bskyPostPageUrl[1] && bskyPostPageUrl[2] === 'post' && bskyPostPageUrl[3]) {
		// Cheripia: 外部の投稿作成者が完全に制御するURL成分を、埋め込み展開で使用される前にホワイトリストで検証する
		const validHandle = /^[a-zA-Z0-9._-]+$/.test(bskyPostPageUrl[1]) || /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(bskyPostPageUrl[1]);
		const validRecordKey = /^[a-zA-Z0-9_-]+$/.test(bskyPostPageUrl[3]);
		if (validHandle && validRecordKey) {
			bskyHandleOrDid.value = bskyPostPageUrl[1];
			bskyPostRecordKey.value = bskyPostPageUrl[3];
		}
	}
}

if (requestUrl.hostname === 'music.youtube.com' && requestUrl.pathname.match('^/(?:watch|channel)')) {
	requestUrl.hostname = 'www.youtube.com';
}

requestUrl.hash = '';

window.fetch(`${instance.urlPreviewEndpoint}?url=${encodeURIComponent(requestUrl.href)}&lang=${versatileLang}`)
	.then(res => {
		if (!res.ok) {
			if (_DEV_) {
				console.warn(`[HTTP${res.status}] Failed to fetch url preview`);
			}
			return null;
		}

		return res.json();
	})
	.catch(err => {
		if (_DEV_) {
			console.warn('Failed to fetch url preview', err);
		}
		return null;
	})
	.then((info: SummalyResult | null) => {
		if (!info || info.url == null) {
			fetching.value = false;
			unknownUrl.value = true;
			autoExpandTweet();
			autoExpandBsky();
			return;
		}

		fetching.value = false;
		unknownUrl.value = false;

		summalyResult.value = {
			...info,
			thumbnail: getProxiedImageUrlNullable(info.thumbnail, 'avatar', true),
			icon: getProxiedImageUrlNullable(info.icon, 'emoji', true),
		};

		if (!info.sensitive) {
			autoExpandTweet();
			autoExpandBsky();
			if (!isDeactivated) {
				playerEnabled.value = (props.showActions && prefer.s.expandUrlPreviewAutomatically);
			}
		}
	});

function setTweetExpanded(expanded: boolean) {
	tweetExpandedByUser = true;
	tweetExpanded.value = expanded;
}

function autoExpandTweet() {
	if (props.detail && !tweetExpandedByUser) tweetExpanded.value = true;
}

function adjustTweetHeight(message: MessageEvent) {
	if (message.origin !== 'https://platform.twitter.com') return;
	const embed = message.data?.['twttr.embed'];
	if (embed?.method !== 'twttr.private.resize') return;
	if (embed?.id !== embedId) return;
	const height = embed?.params[0]?.height;
	if (height) tweetHeight.value = height;
}

function setBskyExpanded(expanded: boolean) {
	bskyExpandedByUser = true;
	bskyExpanded.value = expanded;
	if (expanded) openBskyEmbed();
}

function autoExpandBsky() {
	if (!props.detail || bskyExpandedByUser) return;
	bskyExpanded.value = true;
	openBskyEmbed();
}

async function openBskyEmbed() {
	if (bskyHandleOrDid.value == null || bskyPostRecordKey.value == null) return;
	// Cheripia: 解決失敗が記録済みならfetchを再発行しない
	if (bskyDid.value != null || bskyDidResolving || bskyEmbedUnavailable.value) return;
	if (bskyHandleOrDid.value.startsWith('did:')) {
		bskyDid.value = bskyHandleOrDid.value;
	} else {
		// handleで来ている場合はdidに変換
		bskyDidResolving = true;
		try {
			const bskyApiRes = await window.fetch(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(bskyHandleOrDid.value)}`);
			if (bskyApiRes.ok) {
				const bskyApiData = await bskyApiRes.json() as { did?: string };
				// Cheripia: API応答のdidもW3C DID形式を検証してからiframe展開に使う
				if (typeof bskyApiData.did === 'string' && /^did:[a-z0-9]+:[a-zA-Z0-9._:%-]+$/.test(bskyApiData.did)) {
					bskyDid.value = bskyApiData.did;
				} else {
					bskyEmbedUnavailable.value = true;
				}
			} else {
				// Cheripia: 恒久的なクライアントエラーのみ展開を無効にし、429および5xxでは再試行を許可する。
				if (bskyApiRes.status >= 400 && bskyApiRes.status < 500 && bskyApiRes.status !== 429) {
					bskyEmbedUnavailable.value = true;
				}
				if (_DEV_) {
					console.warn(`[HTTP${bskyApiRes.status}] Failed to resolve bsky handle`);
				}
			}
		} catch (err) {
			// Cheripia: ネットワークエラーなどの一時的な障害が発生した場合でも、ボタンは表示されたままとなり、次回のクリックで再試行されます。
			if (_DEV_) {
				console.warn('Failed to resolve bsky handle', err);
			}
		} finally {
			bskyDidResolving = false;
		}
	}
}

function adjustBskyEmbedHeight(message: MessageEvent) {
	if (message.origin !== 'https://embed.bsky.app') return;
	if (message.data?.id !== embedId) return;
	const height = message.data?.height;
	if (height) bskyHeight.value = height;
}

function openPlayer(): void {
	if (!summalyResult.value) return;

	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkYouTubePlayer.vue')), {
		urlOrSummalyResult: summalyResult.value,
	}, {
		closed: () => {
			dispose();
		},
	});
}

window.addEventListener('message', adjustTweetHeight);
window.addEventListener('message', adjustBskyEmbedHeight);

onUnmounted(() => {
	window.removeEventListener('message', adjustTweetHeight);
	window.removeEventListener('message', adjustBskyEmbedHeight);
});
</script>

<style lang="scss" module>
.player {
	position: relative;
	width: 100%;
}

.disablePlayer {
	position: absolute;
	top: -1.5em;
	right: 0;
	font-size: 1em;
	width: 1.5em;
	height: 1.5em;
	padding: 0;
	margin: 0;
	color: var(--MI_THEME-fg);
	background: rgba(128, 128, 128, 0.2);
	opacity: 0.7;

	&:hover {
		opacity: 0.9;
	}
}

.playerIframe {
	height: 100%;
	left: 0;
	position: absolute;
	top: 0;
	width: 100%;
}

.link {
	position: relative;
	display: block;
	font-size: 14px;
	box-shadow: 0 0 0 1px var(--MI_THEME-divider);
	border-radius: 8px;
	overflow: clip;
	text-align: left;

	&:hover {
		text-decoration: none;
		border-color: rgba(0, 0, 0, 0.2);

		> .body > .header > .title {
			text-decoration: underline;
		}
	}

	&.compact {
		> .body {
			> .header .title, .text, .footer {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}
		}
	}
}

.thumbnail {
	position: absolute;
	width: 100px;
	height: 100%;
	background-position: center;
	background-size: cover;
	background-color: var(--MI_THEME-bg);
	display: flex;
	justify-content: center;
	align-items: center;

	& + .body {
		left: 100px;
		width: calc(100% - 100px);
	}
}

.body {
	position: relative;
	box-sizing: border-box;
	padding: 16px;
}

.header {
	margin-bottom: 8px;
}

.title {
	margin: 0;
	font-size: 1em;
}

.text {
	margin: 0;
	font-size: 0.8em;
}

.footer {
	margin-top: 8px;
	height: 16px;
}

.siteIcon {
	display: inline-block;
	width: 16px;
	height: 16px;
	margin-right: 4px;
	vertical-align: top;
}

.siteName {
	display: inline-block;
	margin: 0;
	font-size: 0.8em;
	line-height: 16px;
	vertical-align: top;
}

.action {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-top: 6px;
}

@container (max-width: 400px) {
	.link {
		font-size: 12px;
	}

	.thumbnail {
		height: 80px;
	}

	.body {
		padding: 12px;
	}
}

@container (max-width: 350px) {
	.link {
		font-size: 10px;

		&.compact {
			> .thumbnail {
				position: absolute;
				width: 56px;
				height: 100%;
			}

			> .body {
				left: 56px;
				width: calc(100% - 56px);
				padding: 4px;

				> .header {
					margin-bottom: 2px;
				}

				> .footer {
					margin-top: 2px;
				}
			}
		}
	}

	.thumbnail {
		height: 70px;
	}

	.body {
		padding: 8px;
	}

	.header {
		margin-bottom: 4px;
	}

	.footer {
		margin-top: 4px;
	}

	.siteIcon {
		width: 12px;
		height: 12px;
	}
}
</style>
