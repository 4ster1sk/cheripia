<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<MkSpacer :contentMax="600">
		<div class="_gaps">
			<div class="_panel" style="padding: 16px;">
				<div style="font-size: 90%; opacity: 0.8; margin-bottom: 8px;">
					このURLを同じインスタンスのユーザーに共有してください。
				</div>
				<div style="display: flex; gap: 8px; align-items: center;">
					<code style="flex: 1; overflow: hidden; text-overflow: ellipsis;">{{ roomUrl }}</code>
					<MkButton small @click="copyUrl">コピー</MkButton>
				</div>
			</div>

			<div class="_panel _gaps" style="padding: 16px;">
				<div v-for="index in [1, 2, 3, 4]" :key="index" :class="$style.seat">
					<template v-if="seatUser(index) != null">
						<MkAvatar :user="seatUser(index)!" :class="$style.seatAvatar"/>
						<span :class="$style.seatName">{{ seatUser(index)!.name ?? seatUser(index)!.username }}</span>
					</template>
					<template v-else-if="seatAi(index)">
						<span :class="[$style.seatBadge, $style.seatCpu]">CPU</span>
					</template>
					<template v-else>
						<span :class="[$style.seatBadge, $style.seatEmpty]">空席</span>
					</template>
					<div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
						<span v-if="seatReady(index)" style="color: var(--MI_THEME-success);">準備完了</span>
						<MkButton v-if="isOwner && !room.isStarted && !room.isEnded && seatAi(index)" small danger @click="removeCpu(index)">削除</MkButton>
					</div>
				</div>
				<div v-if="!isOwner || room.isStarted || room.isEnded" style="margin-top: 8px; font-size: 90%; opacity: 0.8;">
					持ち時間: {{ room.timeLimitForEachTurn }}秒
				</div>
				<div v-if="isOwner && !room.isStarted && !room.isEnded" style="margin-top: 8px;">
					<MkInput v-model="timeLimit" type="number" :min="5" :max="300" :step="1">
						<template #label>{{ i18n.ts._reversi.timeLimitForEachTurn }}</template>
						<template #suffix>{{ i18n.ts._time.second }}</template>
					</MkInput>
				</div>
				<div style="margin-top: 8px; font-size: 90%; opacity: 0.8;">
					{{ i18n.ts._mahjong.matchLength }}: {{ room.matchLength === 'east' ? i18n.ts._mahjong.eastMatch : i18n.ts._mahjong.southMatch }}
				</div>
				<div v-if="isOwner && !room.isStarted && !room.isEnded" style="margin-top: 8px;">
					<MkRadios v-model="matchLength" :options="matchLengthOptions"/>
				</div>
			</div>

			<div v-if="isOwner" class="_buttonsCenter">
				<MkButton rounded @click="addCpu">{{ i18n.ts._mahjong.addCpu }}</MkButton>
			</div>
		</div>
	</MkSpacer>
	<template #footer>
		<div :class="$style.footer">
			<MkSpacer :contentMax="700" :marginMin="16" :marginMax="16">
				<div style="text-align: center;" class="_gaps_s">
					<div class="_buttonsCenter">
						<MkButton rounded danger @click="leave">{{ i18n.ts._mahjong.leave }}</MkButton>
						<MkButton v-if="!isReady" rounded primary @click="ready">{{ i18n.ts._mahjong.ready }}</MkButton>
						<MkButton v-if="isReady" rounded @click="unready">{{ i18n.ts._mahjong.cancelReady }}</MkButton>
					</div>
				</div>
			</MkSpacer>
		</div>
	</template>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { computed, ref, onUnmounted, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { deepClone } from '@/utility/clone.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import type { MkRadiosOption } from '@/components/MkRadios.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkRadios from '@/components/MkRadios.vue';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';

const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.MahjongRoomDetailed;
	connection: Misskey.IChannelConnection<Misskey.Channels['mahjongRoom']>;
}>();

const router = useRouter();

const room = ref<Misskey.entities.MahjongRoomDetailed>(deepClone(props.room));

const timeLimit = ref<number>(room.value.timeLimitForEachTurn);

watch(timeLimit, () => {
	const value = Math.floor(Number(timeLimit.value));
	if (!Number.isInteger(value) || value < 5 || value > 300) return;
	if (value === room.value.timeLimitForEachTurn) return;
	room.value.timeLimitForEachTurn = value;
	props.connection.send('updateSettings', {
		key: 'timeLimitForEachTurn',
		value,
	});
});

const matchLength = ref<'east' | 'south'>(room.value.matchLength ?? 'south');

const matchLengthOptions = [
	{ value: 'east', label: i18n.ts._mahjong.eastMatch },
	{ value: 'south', label: i18n.ts._mahjong.southMatch },
] as MkRadiosOption<string>[];

watch(matchLength, () => {
	if (matchLength.value !== 'east' && matchLength.value !== 'south') return;
	if (matchLength.value === room.value.matchLength) return;
	room.value.matchLength = matchLength.value;
	props.connection.send('updateSettings', {
		key: 'matchLength',
		value: matchLength.value,
	});
});

const roomUrl = computed(() => `${url}/mahjong/g/${room.value.id}`);
const isOwner = computed(() => room.value.user1Id === $i.id);

const isReady = computed(() => {
	if (room.value.user1Id === $i.id && room.value.user1Ready) return true;
	if (room.value.user2Id === $i.id && room.value.user2Ready) return true;
	if (room.value.user3Id === $i.id && room.value.user3Ready) return true;
	if (room.value.user4Id === $i.id && room.value.user4Ready) return true;
	return false;
});

function seatUser(index: number): Misskey.entities.UserLite | null {
	switch (index) {
		case 1: return room.value.user1;
		case 2: return room.value.user2;
		case 3: return room.value.user3;
		case 4: return room.value.user4;
		default: return null;
	}
}

function seatAi(index: number): boolean {
	switch (index) {
		case 1: return room.value.user1Ai;
		case 2: return room.value.user2Ai;
		case 3: return room.value.user3Ai;
		case 4: return room.value.user4Ai;
		default: return false;
	}
}

function seatReady(index: number): boolean {
	switch (index) {
		case 1: return room.value.user1Ready;
		case 2: return room.value.user2Ready;
		case 3: return room.value.user3Ready;
		case 4: return room.value.user4Ready;
		default: return false;
	}
}

async function copyUrl() {
	await copyToClipboard(roomUrl.value);
	os.success();
}

async function leave() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	props.connection.send('leave', {});
	router.push('/mahjong');
}

function ready() {
	props.connection.send('ready', true);
}

function unready() {
	props.connection.send('ready', false);
}

function addCpu() {
	props.connection.send('addAi', {});
}

function removeCpu(index: number) {
	props.connection.send('removeAi', { index });
}

function onChangeReadyStates(states: {
	user1: boolean;
	user2: boolean;
	user3: boolean;
	user4: boolean;
}) {
	room.value.user1Ready = states.user1;
	room.value.user2Ready = states.user2;
	room.value.user3Ready = states.user3;
	room.value.user4Ready = states.user4;
}

function onJoined(x: {
	index: number;
	user: Misskey.entities.UserLite | null;
}) {
	switch (x.index) {
		case 1:
			room.value.user1 = x.user;
			room.value.user1Ai = x.user == null;
			break;
		case 2:
			room.value.user2 = x.user;
			room.value.user2Ai = x.user == null;
			break;
		case 3:
			room.value.user3 = x.user;
			room.value.user3Ai = x.user == null;
			break;
		case 4:
			room.value.user4 = x.user;
			room.value.user4Ai = x.user == null;
			break;
	}
}

function onLeft(x: { index: number }) {
	switch (x.index) {
		case 1:
			room.value.user1 = null;
			break;
		case 2:
			room.value.user2 = null;
			room.value.user2Ai = false;
			room.value.user2Ready = false;
			break;
		case 3:
			room.value.user3 = null;
			room.value.user3Ai = false;
			room.value.user3Ready = false;
			break;
		case 4:
			room.value.user4 = null;
			room.value.user4Ai = false;
			room.value.user4Ready = false;
			break;
	}
}

props.connection.on('changeReadyStates', onChangeReadyStates);
props.connection.on('joined', onJoined);
props.connection.on('left', onLeft);

onUnmounted(() => {
	props.connection.off('changeReadyStates', onChangeReadyStates);
	props.connection.off('joined', onJoined);
	props.connection.off('left', onLeft);
});
</script>

<style lang="scss" module>
.seat {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 8px 0;
	border-top: solid 1px var(--MI_THEME-divider);

	&:first-child {
		border-top: none;
	}
}

.seatAvatar {
	width: 40px;
	height: 40px;
	flex-shrink: 0;
}

.seatName {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.seatBadge {
	flex-shrink: 0;
	width: 40px;
	padding: 4px 0;
	border-radius: 999px;
	font-size: 80%;
	font-weight: bold;
	text-align: center;
}

.seatCpu {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.seatEmpty {
	opacity: 0.5;
}

.footer {
	-webkit-backdrop-filter: var(--blur, blur(15px));
	backdrop-filter: var(--blur, blur(15px));
	background: var(--acrylicBg);
	border-top: solid 0.5px var(--divider);
}
</style>
