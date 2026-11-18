<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="self ? 'MkA' : 'a'" ref="el" style="word-break: break-all;" class="_link" :[attr]="maybeRelativeUrl" :rel="rel ?? 'nofollow noopener'" :target="target"
	:behavior="props.navigationBehavior"
	:title="url_string"
	@click.stop="(ev: MouseEvent) => warningExternalWebsite(ev, url_string)"
>
	<slot></slot>
	<i v-if="target === '_blank' && !hideIcon" class="ti ti-external-link" :class="$style.icon"></i>
</component>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { url as local } from '@@/js/config.js';
import { maybeMakeRelative } from '@@/js/url.js';
import type { MkABehavior } from '@/components/global/MkA.vue';
import { useTooltip } from '@/composables/use-tooltip.js';
import * as os from '@/os.js';
import { isEnabledUrlPreview } from '@/utility/url-preview.js';
import { warningExternalWebsite } from '@/utility/warning-external-website.js';

const props = withDefaults(defineProps<{
	url: string;
	rel?: null | string;
	navigationBehavior?: MkABehavior;
	host?: null | string;
	hideIcon?: boolean;
}>(), {
	hideIcon: false,
});

// clips/play のURLが他サーバー向けにコピーされた場合、ローカルのURLに置き換える
const rewrittenUrl = computed(() => {
	const requestUrl = new URL(props.url, window.location.href);
	if (props.host === requestUrl.host && (requestUrl.pathname.startsWith('/clips/') || requestUrl.pathname.startsWith('/play/'))) {
		const split = requestUrl.pathname.split('@');
		return new URL(local + split[0] + '@' + (split.length >= 2 ? split[1] : props.host));
	}
	return null;
});
const maybeRelativeUrl = computed(() => {
	const url = rewrittenUrl.value;
	return url != null ? maybeMakeRelative(url.toString(), local) : maybeMakeRelative(props.url, local);
});
const self = computed(() => rewrittenUrl.value != null || maybeRelativeUrl.value !== props.url);
const url_string = computed(() => (rewrittenUrl.value ?? new URL(props.url, window.location.href)).toString());
const attr = computed(() => (self.value ? 'to' : 'href'));
const target = computed(() => (self.value ? null : '_blank'));

const el = ref<HTMLElement | { $el: HTMLElement }>();

if (isEnabledUrlPreview.value) {
	// URL が変わったら古い URL のプレビューを閉じる
	let previewShowing: Ref<boolean> | null = null;
	watch(() => props.url, () => {
		if (previewShowing != null) previewShowing.value = false;
		previewShowing = null;
	});

	useTooltip(el, (showing) => {
		const anchorElement = el.value instanceof HTMLElement ? el.value : el.value?.$el;
		if (anchorElement == null) return;
		previewShowing = showing;
		const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkUrlPreviewPopup.vue')), {
			showing,
			url: props.url,
			anchorElement: anchorElement,
		}, {
			closed: () => dispose(),
		});
	});
}
</script>

<style lang="scss" module>
.icon {
	padding-left: 2px;
	font-size: .9em;
}
</style>
