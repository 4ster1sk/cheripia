<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root]">
	<XTile
		v-for="(item, i) in displayTiles"
		:key="i"
		:tile="item.instance"
		:faceDown="item.faceDown"
		:variation="item.sideways ? '3' : '1'"
		:doras="doras"
		:class="{ [$style.sideways]: item.sideways }"
	/>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Mmj from 'misskey-mahjong';
import XTile from './tile.vue';

const props = defineProps<{
	huro: Mmj.Huro;
	caller: Mmj.House;
	doras: Mmj.TileType[];
}>();

type DisplayTile = {
	instance?: Mmj.TileInstance;
	faceDown: boolean;
	sideways: boolean;
};

/**
 * 鳴いた牌の横向き位置.
 * 上家から鳴いた場合は左端、対面からは中央、下家からは右端に置く.
 * 4枚の明槓で対面からの場合は左から2枚目 (index 1) に置く.
 */
function callSidewaysIndex(caller: Mmj.House, from: Mmj.House | null, size: 3 | 4): number {
	if (from == null) return 0;
	if (from === Mmj.prevHouse(caller)) return 0;
	if (from === Mmj.nextHouse(caller)) return size - 1;
	return 1;
}

function instanceOrUndefined(id: Mmj.TileId): Mmj.TileInstance | undefined {
	if (id === 0) return undefined;
	return Mmj.findTileByIdOrFail(id);
}

const displayTiles = computed<DisplayTile[]>(() => {
	const huro = props.huro;
	if (huro.type === 'ankan') {
		if (huro.tiles[0] === 0) {
			return [0, 1, 2, 3].map(() => ({ faceDown: true, sideways: false }));
		}
		const t0 = huro.tiles[0];
		const t3 = huro.tiles[3];
		return [
			{ instance: instanceOrUndefined(t0), faceDown: false, sideways: false },
			{ faceDown: true, sideways: false },
			{ faceDown: true, sideways: false },
			{ instance: instanceOrUndefined(t3), faceDown: false, sideways: false },
		];
	}
	if (huro.type === 'pon') {
		const claimed = huro.tiles[0];
		const hands = [huro.tiles[1], huro.tiles[2]];
		const idx = callSidewaysIndex(props.caller, huro.from, 3);
		const ordered: Mmj.TileId[] = [];
		let h = 0;
		for (let i = 0; i < 3; i++) {
			ordered.push(i === idx ? claimed : hands[h++]!);
		}
		return ordered.map((t, i) => ({ instance: instanceOrUndefined(t), faceDown: t === 0, sideways: i === idx }));
	}
	if (huro.type === 'minkan') {
		if (huro.kakan) {
			// 加槓: 元のポン3枚をポン表示にし、追加牌を右端に立てて置く
			const added = huro.tiles[0];
			const claimed = huro.tiles[1];
			const hands = [huro.tiles[2], huro.tiles[3]];
			const idx = callSidewaysIndex(props.caller, huro.from, 3);
			const ordered: Mmj.TileId[] = [];
			let h = 0;
			for (let i = 0; i < 3; i++) {
				ordered.push(i === idx ? claimed : hands[h++]!);
			}
			return [
				...ordered.map((t, i) => ({ instance: instanceOrUndefined(t), faceDown: t === 0, sideways: i === idx })),
				{ instance: instanceOrUndefined(added), faceDown: added === 0, sideways: false },
			];
		}
		const claimed = huro.tiles[0];
		const hands = [huro.tiles[1], huro.tiles[2], huro.tiles[3]];
		const idx = callSidewaysIndex(props.caller, huro.from, 4);
		const ordered: Mmj.TileId[] = [];
		let h = 0;
		for (let i = 0; i < 4; i++) {
			ordered.push(i === idx ? claimed : hands[h++]!);
		}
		return ordered.map((t, i) => ({ instance: instanceOrUndefined(t), faceDown: t === 0, sideways: i === idx }));
	}
	// チー: 手牌順のまま、鳴いた牌だけ横向きにする
	const idx = huro.pattern === '_x_' ? 1 : huro.pattern === '__x' ? 2 : 0;
	return huro.tiles.map((t, i) => ({ instance: instanceOrUndefined(t), faceDown: t === 0, sideways: i === idx }));
});
</script>

<style lang="scss" module>
.root {
	// 副露の牌は河と同じ見かけの大きさにする。河は .hoTilesContainer が
	// --mj-tile-ratio: 0.8 を指定して縮小するが、副露レーンはその外にあるため、
	// ここでも倍率を指定しないと副露の牌だけ 25% 大きく見える。
	// tile.vue の寸法はこの倍率で連動する。
	--mj-tile-ratio: 0.8;
}
.sideways {
	// 横向き牌 (putted-tile-3) は縦牌より底辺が浮く (705px舞台で実測7px)。
	// 内訳: アセット内の牌本体の底辺位置 (223/256 vs 239/256) と、
	// tile.vue の .h/.v の下マージン差 (-0.52cqw vs -1.15cqw) の合算。
	// 副露内でのみ translate で補正して底辺を揃える (河のリーチ牌には影響させない)。
	translate: 0 min(calc(10px * var(--mj-tile-ratio, 1)), calc(1.04cqw * var(--mj-tile-ratio, 1)));
}
.root .sideways {
	// 横向き牌の本体は縦牌より幅広い (アセット実測: 本体幅 176/256 vs 128/256、
	// 設計72px箱では 49.5px vs 36px)。tile.vue の .h の横マージン (-19px) のままだと
	// 隣とのピッチが 35px になり、本体同士が約7.8pxずつ重なって隣の牌の顔面を食う
	// (実測: 顔面の食われが最大約200px²、縦牌同士はピッチ36px = 本体幅で重なり0)。
	// 副露内では横マージンを -11.25px にしてピッチを 42.75px にし、
	// 縦牌同士と同じく「本体が接するだけ」の関係にする。
	// 特異度 (0,2,0) で tile.vue の .h (0,1,0) より優先させる。
	margin-left: max(calc(-11.25px * var(--mj-tile-ratio, 1)), calc(-1.17cqw * var(--mj-tile-ratio, 1)));
	margin-right: max(calc(-11.25px * var(--mj-tile-ratio, 1)), calc(-1.17cqw * var(--mj-tile-ratio, 1)));
}
</style>
