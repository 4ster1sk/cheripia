<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.h]: variation === '3', [$style.s]: ['4', '5'].includes(variation), [$style.v]: ['1', '2'].includes(variation), [$style.isDora]: isDora }]">
	<img :src="`/client-assets/mahjong/putted-tile-${variation}.png`" :class="$style.bg"/>
	<img v-if="tileSrc != null" :src="tileSrc" :class="$style.fg"/>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Mmj from 'misskey-mahjong';

const props = withDefaults(defineProps<{
	tile?: Mmj.TileInstance;
	variation: string;
	doras: Mmj.TileType[];
	faceDown?: boolean;
}>(), {
	faceDown: false,
});

const tileSrc = computed(() => {
	if (props.faceDown || props.tile == null) return null;
	return `/client-assets/mahjong/tiles/${props.tile.red ? props.tile.t + 'r' : props.tile.t}.png`;
});

const isDora = computed(() => !props.faceDown && props.tile != null && props.doras.includes(props.tile.t));
</script>

<style lang="scss" module>
@keyframes shine {
	0% { translate: -320% 0; }
	60% { translate: 460% 0; }
	100% { translate: 460% 0; }
}

.root {
	display: inline-block;
	position: relative;
	// 設計 72px = 舞台幅 (room.game.vue の .taku) の 7.5%。舞台外 (ドラ表示等) では
	// cqw が viewport 基準にフォールバックし、72px 上限で従来どおり表示される。
	// 負マージンも同じ比率で連動させ、実効セル寸法の比率を保つ。
	// --mj-tile-ratio は寸法全体の倍率 (既定1)。副露内では huro.vue が、
	// 河内では .hoTilesContainer (room.game.vue) が 0.8 を指定する。
	width: min(calc(72px * var(--mj-tile-ratio, 1)), calc(7.5cqw * var(--mj-tile-ratio, 1)));
	height: min(calc(72px * var(--mj-tile-ratio, 1)), calc(7.5cqw * var(--mj-tile-ratio, 1)));
	margin: max(calc(-17px * var(--mj-tile-ratio, 1)), calc(-1.77cqw * var(--mj-tile-ratio, 1)));
}
.h {
	margin: max(calc(-14px * var(--mj-tile-ratio, 1)), calc(-1.46cqw * var(--mj-tile-ratio, 1))) max(calc(-19px * var(--mj-tile-ratio, 1)), calc(-1.98cqw * var(--mj-tile-ratio, 1))) max(calc(-5px * var(--mj-tile-ratio, 1)), calc(-0.52cqw * var(--mj-tile-ratio, 1)));
	.fg {
		rotate: 90deg;
		// 横向き牌の前面は縦向きより浅い (アセット実測: 高さ105/256 vs 142/256)。
		// 絵柄を 53% のままで置くと前面の縁まで絵が届いて切れて見えるため、
		// 縦向き牌の前面に対する絵柄の占有率 (約64%) に合わせて 46% に縮める。
		width: 46%;
		height: 46%;
	}
}
.s {
	// 左右の河 (variation 4/5) 用。.h と同じセル寸法だが fg は回転させない。
	// 河グリッド側が ±90deg 回転するため、fg まで回すと絵柄が二重に回って
	// 上家は上下逆・下家は正立になってしまう。グリッドの回転だけで
	// 「その家の向きに倒れた絵柄」になるのが正しい。
	margin: max(calc(-14px * var(--mj-tile-ratio, 1)), calc(-1.46cqw * var(--mj-tile-ratio, 1))) max(calc(-19px * var(--mj-tile-ratio, 1)), calc(-1.98cqw * var(--mj-tile-ratio, 1))) max(calc(-5px * var(--mj-tile-ratio, 1)), calc(-0.52cqw * var(--mj-tile-ratio, 1)));
}
.v {
	margin: max(calc(-14px * var(--mj-tile-ratio, 1)), calc(-1.46cqw * var(--mj-tile-ratio, 1))) max(calc(-18px * var(--mj-tile-ratio, 1)), calc(-1.88cqw * var(--mj-tile-ratio, 1))) max(calc(-11px * var(--mj-tile-ratio, 1)), calc(-1.15cqw * var(--mj-tile-ratio, 1)));
}
.bg {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
}
.fg {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	margin: auto;
	width: 53%;
	height: 53%;
	object-fit: contain;
}
.isDora {
	overflow: hidden;
	border-radius: 6px;
	&:after {
		// 光の帯は牌の大きさに比例させる (旧実装は 200px/30px 等の固定pxで、
		// 小さい牌では帯がはみ出して斜めの金色バーのように見えた)。
		// 帯は本体の縦範囲 (約19%〜93%) の内側を通り、横切った後は画面外で待機する。
		content: "";
		display: block;
		position: absolute;
		top: 16%;
		left: 0;
		width: 32%;
		height: 68%;
		rotate: -24deg;
		background: linear-gradient(90deg, transparent, #ffe970e6 45%, #fff6c4 50%, #ffe970e6 55%, transparent);
		box-shadow: 0 0 12px 2px #ffcc00aa;
		animation: shine 2.8s ease-in-out infinite;
		pointer-events: none;
	}
}
</style>
