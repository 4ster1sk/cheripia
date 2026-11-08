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
}
</style>
