<!--
SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span :class="$style.root">
	<span :class="$style.points">{{ displayValue }}点</span>
	<span
		:key="badgeKey"
		:class="[$style.delta, props.delta > 0 ? $style.deltaPlus : props.delta < 0 ? $style.deltaMinus : $style.deltaZero]"
	>{{ deltaLabel }}</span>
</span>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps<{
	value: number;
	delta: number;
}>();

const ANIMATION_DURATION_MS = 750;

const displayValue = ref(props.value - props.delta);
const badgeKey = ref(0);

let rafId: number | null = null;

const deltaLabel = computed(() => props.delta > 0 ? `+${props.delta}` : props.delta < 0 ? `${props.delta}` : '±0');

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function cancelAnimation(): void {
	if (rafId !== null) {
		window.cancelAnimationFrame(rafId);
		rafId = null;
	}
}

function animateTo(value: number, delta: number): void {
	cancelAnimation();

	if (delta === 0 || prefersReducedMotion()) {
		displayValue.value = value;
		return;
	}

	const from = value - delta;
	let start: number | null = null;

	function step(timestamp: number): void {
		if (start === null) {
			start = timestamp;
		}

		const progress = Math.min((timestamp - start) / ANIMATION_DURATION_MS, 1);
		displayValue.value = Math.round(from + (value - from) * easeOutCubic(progress));

		if (progress < 1) {
			rafId = window.requestAnimationFrame(step);
		} else {
			displayValue.value = value;
			rafId = null;
		}
	}

	rafId = window.requestAnimationFrame(step);
}

watch(() => [props.value, props.delta] as const, ([value, delta]) => {
	badgeKey.value++;
	animateTo(value, delta);
}, { immediate: true });

onBeforeUnmount(cancelAnimation);
</script>

<style lang="scss" module>
@keyframes deltaPop {
	0% {
		opacity: 0;
		translate: 0 -6px;
		scale: 0.8;
	}

	55% {
		opacity: 1;
		translate: 0 0;
		scale: 1.12;
	}

	100% {
		opacity: 1;
		translate: 0 0;
		scale: 1;
	}
}

.root {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.points {
	font-weight: bold;
	min-width: 8ch;
	text-align: right;
}

.delta {
	min-width: 6ch;
	text-align: right;
	font-size: 85%;
	font-weight: bold;
	animation: deltaPop 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.deltaPlus {
	color: var(--MI_THEME-success);
}

.deltaMinus {
	color: var(--MI_THEME-error);
}

.deltaZero {
	color: color-mix(in srgb, var(--MI_THEME-fg) 55%, transparent);
}

@media (prefers-reduced-motion: reduce) {
	.delta {
		animation: none;
	}
}
</style>
