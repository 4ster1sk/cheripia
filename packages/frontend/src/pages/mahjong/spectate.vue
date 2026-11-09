<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkSpacer :contentMax="800">
	<div v-if="room == null">
		<MkLoading/>
	</div>
	<div v-else-if="state != null" :class="$style.root">
		<div :class="$style.header">
			<div :class="$style.title">
				<span :class="$style.badge">{{ i18n.ts._mahjong.spectating }}</span>
				<span>{{ i18n.ts._mahjong.mahjong }}</span>
			</div>
			<div :class="$style.status">
				<span>{{ roundLabel }}</span>
				<span>{{ i18n.tsx.remainingN({ n: state.tilesCount }) }}</span>
			</div>
			<div :class="$style.dora">
				<span :class="$style.doraLabel">{{ i18n.ts._mahjong.dora }}</span>
				<XTile v-for="(tile, i) in doraIndicateTiles" :key="i" :tile="tileInstance(tile)" variation="1" :doras="[]"/>
			</div>
		</div>

		<div :class="$style.seats">
			<div v-for="house in houses" :key="house" class="_panel" :class="[$style.seat, { [$style.seatTurn]: state.turn === house }]">
				<div :class="$style.seatHeader">
					<span :class="$style.house">{{ houseLabel(house) }}</span>
					<template v-if="houseToUser(house) != null">
						<MkAvatar :user="houseToUser(house)!" :class="$style.avatar"/>
						<span :class="$style.name">{{ houseToUser(house)!.name ?? houseToUser(house)!.username }}</span>
					</template>
					<span v-else :class="$style.name">CPU</span>
					<i v-if="state.turn === house" class="ti ti-player-play" :class="$style.turnIcon"></i>
					<span v-if="state.riichis[house]" :class="$style.riichi">{{ i18n.ts._mahjong.riichi }}</span>
					<span :class="$style.points">{{ state.points[house] }}点</span>
				</div>

				<div v-if="state.huros[house].length > 0" :class="$style.tiles">
					<XHuro v-for="(huro, i) in state.huros[house]" :key="i" :huro="huro" :caller="house" :doras="doras"/>
				</div>

				<div :class="$style.tiles">
					<XTile v-for="tile in sortedHand(house)" :key="tile" :tile="tileInstance(tile)" variation="1" :doras="doras"/>
				</div>

				<div v-if="state.hoTiles[house].length > 0" :class="[$style.tiles, $style.river]">
					<XTile v-for="(tile, i) in state.hoTiles[house]" :key="i" :tile="tileInstance(tile)" :variation="tile === state.riichiTiles?.[house] ? '3' : '1'" :doras="doras" :class="{ [$style.callTarget]: i === state.hoTiles[house].length - 1 }"/>
				</div>

				<div v-if="waitTiles[house].length > 0" :class="$style.waitTiles">
					<span :class="$style.label">{{ i18n.ts._mahjong.waitTiles }}</span>
					<XTile v-for="type in waitTiles[house]" :key="type" :tile="tileInstance(tileTypeToTileId(type))" variation="1" :doras="[]"/>
				</div>
			</div>
		</div>

		<div :class="$style.footer">
			<MkButton @click="backToLobby">{{ i18n.ts.goBack }}</MkButton>
		</div>
	</div>
</MkSpacer>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import * as Mmj from 'misskey-mahjong';
import XTile from './tile.vue';
import XHuro from './huro.vue';
import MkButton from '@/components/MkButton.vue';
import { definePage } from '@/page.js';
import { useStream } from '@/stream.js';
import { useRouter } from '@/router.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import * as os from '@/os.js';

const $i = ensureSignin();

const props = defineProps<{
	roomId: string;
}>();

const router = useRouter();

const houses: Mmj.House[] = ['e', 's', 'w', 'n'];

const room = shallowRef<Misskey.entities.MahjongRoomDetailed | null>(null);
const connection = shallowRef<Misskey.IChannelConnection<Misskey.Channels['mahjongRoom']> | null>(null);

let leaving = false;

const state = computed<Mmj.PlayerState | null>(() => {
	const gameState = room.value?.gameState;
	if (gameState == null) return null;
	return gameState as unknown as Mmj.PlayerState;
});

const doraIndicateTiles = computed(() => state.value?.doraIndicateTiles ?? []);

const doras = computed(() => doraIndicateTiles.value.map(tile => Mmj.nextTileForDora(tileInstance(tile).t)));

const waitTiles = computed<Record<Mmj.House, Mmj.TileType[]>>(() => {
	const result: Record<Mmj.House, Mmj.TileType[]> = {
		'e': [],
		's': [],
		'w': [],
		'n': [],
	};
	const s = state.value;
	if (s == null) return result;
	for (const house of houses) {
		const handTiles = s.handTiles[house];
		// 13枚相当 (副露分を除く) のときのみ待ち牌が存在する
		if (handTiles.length % 3 !== 1) continue;
		const handTileTypes = handTiles.map(id => tileInstance(id).t);
		const huros = s.huros[house].map(huro => Mmj.convertHuroForCalcYaku(huro));
		result[house] = Mmj.getWaitTiles(handTileTypes, huros);
	}
	return result;
});

function tileInstance(tid: Mmj.TileId): Mmj.TileInstance {
	return Mmj.findTileByIdOrFail(tid);
}

function tileTypeToTileId(type: Mmj.TileType): Mmj.TileId {
	for (const [id, tile] of Mmj.TILE_ID_MAP) {
		if (tile.t === type && tile.red !== true) return id;
	}
	throw new Error(`tile not found: ${type}`);
}

function houseToUser(house: Mmj.House): Misskey.entities.UserLite | null {
	const s = state.value;
	const r = room.value;
	if (s == null || r == null) return null;
	if (s.user1House === house) return r.user1;
	if (s.user2House === house) return r.user2;
	if (s.user3House === house) return r.user3;
	return r.user4;
}

function houseLabel(house: Mmj.House): string {
	return house === 'e' ? i18n.ts._mahjong.east : house === 's' ? i18n.ts._mahjong.south : house === 'w' ? i18n.ts._mahjong.west : i18n.ts._mahjong.north;
}

const roundLabel = computed(() => {
	const s = state.value;
	if (s == null) return '';
	return `${houseLabel(s.round)}${i18n.tsx._mahjong.kyoku({ n: s.kyoku })}`;
});

function sortedHand(house: Mmj.House): Mmj.TileId[] {
	const s = state.value;
	if (s == null) return [];
	return Mmj.sortTiles(s.handTiles[house]);
}

function backToLobby() {
	router.push('/mahjong');
}

async function backToLobbyWithAlert(text: string) {
	if (leaving) return;
	leaving = true;
	await os.alert({
		type: 'warning',
		text,
	});
	router.push('/mahjong');
}

function disposeConnection() {
	if (connection.value != null) {
		connection.value.dispose();
		connection.value = null;
	}
}

function connect() {
	disposeConnection();
	const _connection = useStream().useChannel('mahjongRoom', {
		roomId: props.roomId,
	});
	connection.value = _connection;
	_connection.on('spectatorState', payload => {
		room.value = payload.room;
		if (payload.room.isEnded) {
			void backToLobbyWithAlert('対局が終了しました。');
		}
	});
}

async function fetchRoom() {
	try {
		const _room = await misskeyApi('mahjong/show-room', {
			roomId: props.roomId,
		});

		if (_room.isEnded) {
			await backToLobbyWithAlert('対局は終了しています。');
			return;
		}
		if (!_room.isStarted) {
			await backToLobbyWithAlert('観戦できる対局がありません。');
			return;
		}
		if ([_room.user1Id, _room.user2Id, _room.user3Id, _room.user4Id].includes($i.id)) {
			// 対局者本人は通常の対局画面へ
			router.pushByPath(`/mahjong/g/${_room.id}`);
			return;
		}

		room.value = _room;
		connect();
	} catch (err) {
		console.error(err);
		await backToLobbyWithAlert('ルームが存在しないか、観戦できません。');
	}
}

watch(() => props.roomId, () => {
	disposeConnection();
	leaving = false;
	room.value = null;
	void fetchRoom();
});

onMounted(() => {
	void fetchRoom();
});

onUnmounted(() => {
	disposeConnection();
});

definePage(computed(() => ({
	title: i18n.ts._mahjong.spectating,
	icon: 'ti ti-eye',
})));
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
}

.title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: bold;
}

.status {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: bold;
}

.badge {
	padding: 2px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 80%;
}

.dora {
	display: flex;
	align-items: center;
	gap: 4px;
}

.doraLabel {
	margin-right: 4px;
	font-size: 80%;
	opacity: 0.7;
}

.seats {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.seat {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 12px;
}

.seatTurn {
	outline: solid 2px var(--MI_THEME-accent);
	background: var(--MI_THEME-panelHighlight);
}

.seatHeader {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.house {
	font-weight: bold;
}

.avatar {
	width: 24px;
	height: 24px;
}

.name {
	font-weight: bold;
}

.turnIcon {
	color: var(--MI_THEME-accent);
}

.riichi {
	color: var(--MI_THEME-warn);
	font-size: 80%;
	font-weight: bold;
}

.points {
	margin-left: auto;
}

.tiles {
	display: flex;
	align-items: flex-end;
	flex-wrap: wrap;
}

.label {
	margin-right: 4px;
	font-size: 80%;
	opacity: 0.7;
}

.river {
	border-top: 1px dashed var(--MI_THEME-divider);
	padding-top: 8px;
}

.callTarget {
	outline: 2px solid #ffd54f;
	outline-offset: 2px;
	border-radius: 4px;
}

.waitTiles {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
}

.footer {
	display: flex;
	justify-content: center;
}
</style>
