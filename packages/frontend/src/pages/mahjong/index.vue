<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkSpacer :contentMax="600">
	<div class="_gaps">
		<div>
			<img src="/client-assets/mahjong/logo.png" style="display: block; max-width: 100%; max-height: 200px; margin: auto;"/>
		</div>

		<div class="_panel _gaps" style="padding: 16px;">
			<div class="_buttonsCenter">
				<MkButton primary gradate rounded @click="joinRoom">{{ i18n.ts._mahjong.joinRoom }}</MkButton>
				<MkButton primary gradate rounded @click="createRoom">{{ i18n.ts._mahjong.createRoom }}</MkButton>
			</div>
			<div style="font-size: 90%; opacity: 0.7; text-align: center;"><i class="ti ti-music"></i> {{ i18n.ts.soundWillBePlayed }}</div>
		</div>

		<div class="_panel _gaps_s" style="padding: 16px;">
			<div style="font-weight: bold;">{{ i18n.ts._mahjong.activeRooms }}</div>
			<div v-if="activeRooms.length === 0" style="font-size: 90%; opacity: 0.7;">
				{{ i18n.ts._mahjong.noActiveRooms }}
			</div>
			<div v-for="room in activeRooms" :key="room.id" :class="$style.activeRoom">
				<div :class="$style.activeRoomPlayers">
					<template v-for="index in seatIndexes" :key="index">
						<div v-if="seatUser(room, index) != null" :class="$style.activeRoomPlayer">
							<MkAvatar :user="seatUser(room, index)!" :class="$style.activeRoomAvatar"/>
							<span :class="$style.activeRoomPlayerName">{{ seatUser(room, index)!.name ?? seatUser(room, index)!.username }}</span>
						</div>
						<div v-else-if="seatAi(room, index)" :class="$style.activeRoomPlayer">
							<span :class="$style.activeRoomPlayerName">CPU</span>
						</div>
					</template>
				</div>
				<MkA :to="`/mahjong/g/${room.id}/spectate`" :class="$style.spectate">{{ i18n.ts._mahjong.spectate }}</MkA>
			</div>
		</div>

		<div class="_panel" style="padding: 16px;">
			<div style="font-size: 90%; opacity: 0.8;">
				ルームを作成すると対局URLが発行されます。同じインスタンスのユーザーにURLを共有し、4人揃ったら全員が「準備完了」を押してください。人数が足りない場合はCPUを追加できます。
			</div>
		</div>
	</div>
</MkSpacer>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';

const router = useRouter();

const seatIndexes = [1, 2, 3, 4] as const;

const activeRooms = ref<Misskey.entities.MahjongRoomDetailed[]>([]);

function seatUser(room: Misskey.entities.MahjongRoomDetailed, index: 1 | 2 | 3 | 4): Misskey.entities.UserLite | null {
	switch (index) {
		case 1: return room.user1;
		case 2: return room.user2;
		case 3: return room.user3;
		case 4: return room.user4;
	}
}

function seatAi(room: Misskey.entities.MahjongRoomDetailed, index: 1 | 2 | 3 | 4): boolean {
	switch (index) {
		case 1: return room.user1Ai;
		case 2: return room.user2Ai;
		case 3: return room.user3Ai;
		case 4: return room.user4Ai;
	}
}

async function fetchActiveRooms() {
	try {
		activeRooms.value = await misskeyApi('mahjong/rooms', {});
	} catch (err) {
		console.error(err);
	}
}

useInterval(fetchActiveRooms, 1000 * 5, {
	immediate: true,
	afterMounted: true,
});

async function joinRoom() {
	const { canceled, result } = await os.inputText({
		title: 'ルームID / URL',
	});
	if (canceled || result == null || result.trim() === '') return;
	const roomId = result.trim().split('/').at(-1)!;
	try {
		const room = await misskeyApi('mahjong/join-room', {
			roomId,
		});
		router.pushByPath(`/mahjong/g/${room.id}`);
	} catch (err) {
		console.error(err);
		await os.alert({
			type: 'warning',
			text: 'ルームに参加できませんでした。',
		});
	}
}

async function createRoom() {
	try {
		const room = await misskeyApi('mahjong/create-room', {
		});
		router.pushByPath(`/mahjong/g/${room.id}`);
	} catch (err) {
		console.error(err);
		await os.alert({
			type: 'warning',
			text: 'ルームを作成できませんでした。',
		});
	}
}

definePage(computed(() => ({
	title: i18n.ts._mahjong.mahjong,
	icon: 'ti ti-device-gamepad',
})));
</script>

<style lang="scss" module>
.activeRoom {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 0;
	border-top: solid 1px var(--MI_THEME-divider);

	&:first-of-type {
		border-top: none;
	}
}

.activeRoomPlayers {
	display: flex;
	flex: 1;
	flex-wrap: wrap;
	gap: 4px 12px;
	min-width: 0;
}

.activeRoomPlayer {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
}

.activeRoomAvatar {
	width: 24px;
	height: 24px;
}

.activeRoomPlayerName {
	overflow: hidden;
	font-size: 90%;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.spectate {
	flex-shrink: 0;
	padding: 4px 14px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 90%;
	font-weight: bold;
}
</style>
