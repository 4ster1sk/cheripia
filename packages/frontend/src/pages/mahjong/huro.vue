<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root]">
	<template v-if="huro.type === 'ankan' && huro.tiles[0] === 0">
		<XTile v-for="i in 4" :key="i" faceDown variation="3" :doras="[]"/>
	</template>
	<template v-else-if="huro.type === 'ankan'">
		<XTile :tile="Mmj.findTileByIdOrFail(huro.tiles[0])" variation="3" :doras="doras"/>
		<XTile faceDown variation="3" :doras="[]"/>
		<XTile faceDown variation="3" :doras="[]"/>
		<XTile :tile="Mmj.findTileByIdOrFail(huro.tiles[3])" variation="3" :doras="doras"/>
	</template>
	<template v-else>
		<XTile v-for="(tile, i) in huro.tiles" :key="i" :tile="Mmj.findTileByIdOrFail(tile)" variation="3" :doras="doras"/>
	</template>
</div>
</template>

<script lang="ts" setup>
import * as Mmj from 'misskey-mahjong';
import XTile from './tile.vue';

defineProps<{
	huro: Mmj.Huro;
	variation: string;
	doras: Mmj.TileType[];
}>();
</script>

<style lang="scss" module>
.root {
}
</style>
