<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root]">
	<div
		v-for="tile in Mmj.sortTiles(separateLast ? tiles.slice(0, tiles.length - 1) : tiles)"
		:class="[$style.tile, { [$style.tileNonSelectable]: selectableTiles != null && !selectableTiles.includes(mj$type(tile)), [$style.tileDora]: doras.includes(mj$type(tile)) }]"
		@click="chooseTile(tile, $event)"
	>
		<div :class="$style.tileInner">
			<div :class="$style.tileBg1"></div>
			<div :class="$style.tileBg2"></div>
			<div :class="$style.tileBg3"></div>
			<img :src="`/client-assets/mahjong/tiles/${mj$(tile).red ? mj$type(tile) + 'r' : mj$type(tile)}.png`" :class="$style.tileFg1"/>
			<div :class="$style.tileFg2"></div>
		</div>
	</div>
	<div
		v-if="separateLast"
		style="display: inline-block; margin-left: min(5px, 0.52cqw);"
		:class="[$style.tile, { [$style.tileNonSelectable]: selectableTiles != null && !selectableTiles.includes(mj$type(tiles[tiles.length - 1])), [$style.tileDora]: doras.includes(mj$type(tiles[tiles.length - 1])) }]"
		@click="chooseTile(tiles[tiles.length - 1], $event)"
	>
		<div :class="$style.tileInner">
			<div :class="$style.tileBg1"></div>
			<div :class="$style.tileBg2"></div>
			<div :class="$style.tileBg3"></div>
			<img :src="`/client-assets/mahjong/tiles/${mj$(tiles[tiles.length - 1]).red ? mj$type(tiles[tiles.length - 1]) + 'r' : mj$type(tiles[tiles.length - 1])}.png`" :class="$style.tileFg1"/>
			<div :class="$style.tileFg2"></div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Mmj from 'misskey-mahjong';

//#region syntax suger
function mj$(tid: Mmj.TileId): Mmj.TileInstance {
	return Mmj.findTileByIdOrFail(tid);
}

function mj$type(tid: Mmj.TileId): Mmj.TileType {
	return mj$(tid).t;
}
//#endregion

const props = defineProps<{
	tiles: Mmj.TileId[];
	doras: Mmj.TileType[];
	selectableTiles: Mmj.TileType[] | null;
	separateLast: boolean;
}>();

const emit = defineEmits<{
	(event: 'choose', tile: Mmj.TileId, ev: MouseEvent): void;
}>();

function chooseTile(tile: Mmj.TileId, event: MouseEvent) {
	if (props.selectableTiles != null && !props.selectableTiles.includes(mj$type(tile))) return;
	emit('choose', tile, event);
}
</script>

<style lang="scss" module>
@keyframes shine {
	0% { translate: -320% 0; }
	60% { translate: 460% 0; }
	100% { translate: 460% 0; }
}

.root {
	// 折り返し禁止。舞台 (room.game.vue の .taku) が狭いときは牌側が cqw で縮む。
	white-space: nowrap;
}

.tile {
	display: inline-block;
	vertical-align: bottom;
	position: relative;
	// 14枚 = 舞台幅の約51%。設計幅 (960px) では従来どおり 35px。
	// 両隅の名札 (各17.7%) と合わせても舞台幅に収まり、重なりも折り返しも起きない。
	width: min(35px, 3.65cqw);
	aspect-ratio: 0.7;
	cursor: pointer;
}
.tileInner {
	position: relative;
	width: 100%;
	height: 100%;
	overflow: clip;
	border-radius: 4px;
	transition: translate 0.1s ease;
}
.tile:hover > .tileInner {
	translate: 0 -10px;
}
.tileNonSelectable {
	filter: grayscale(1);
	opacity: 0.7;
	pointer-events: none;
}

.tileDora > .tileInner {
	&:after {
		// tile.vue の .isDora と同じ設計に揃える。旧実装は top 30px・幅 200px・
		// 高さ 8px・-45deg の固定pxで、35px幅の手札牌では帯がはみ出して
		// 白い斜めバーのように見えた (背景も金ではなく白 #ffffffee だった)。
		// 帯は牌サイズ比例 (幅32%・高さ68%・top 16%) の金色グラデーションにし、
		// 横切った後は残りの周期 (40%) は画面外で待機させる。
		content: "";
		display: block;
		position: absolute;
		top: 16%;
		left: 0;
		width: 32%;
		height: 68%;
		rotate: -24deg;
		background: linear-gradient(90deg, transparent, #ffe970e6 45%, #fff6c4 50%, #ffe970e6 55%, transparent);
		animation: shine 2.8s ease-in-out infinite;
		pointer-events: none;
	}
}

.tileBg1 {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
	user-select: none;
	background: #E38A45;
}
.tileBg2 {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 100%;
	height: 95%;
	pointer-events: none;
	user-select: none;
	background: #DFDEDD;
	border-radius: 3px 3px 0 0;

	&:after {
		content: "";
		display: block;
		position: absolute;
		bottom: 78%;
		left: 0;
		width: 100%;
		height: 6%;
		pointer-events: none;
		user-select: none;
		background: linear-gradient(0deg, #fff 0%, #fff0 100%);
	}
}
.tileBg3 {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 100%;
	height: 75%;
	pointer-events: none;
	user-select: none;
	background: #fff;
}
.tileFg1 {
	position: absolute;
	bottom: 5%;
	left: 0;
	width: 100%;
	height: 65%;
	object-fit: contain;
	pointer-events: none;
	user-select: none;
}
.tileFg2 {
	position: absolute;
	bottom: 0;
	left: 0;
	width: 100%;
	height: 100%;
	box-shadow: 0 0 1px #000 inset;
	pointer-events: none;
	user-select: none;
}
</style>
