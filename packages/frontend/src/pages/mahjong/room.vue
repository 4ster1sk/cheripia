<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="room == null"><MkLoading/></div>
<RoomSetting v-else-if="!room.isStarted && !room.isEnded" :room="room" :connection="connection!"/>
<RoomGame v-else :room="room" :connection="connection"/>
</template>

<script lang="ts" setup>
import { computed, watch, onMounted, shallowRef, onUnmounted } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import RoomSetting from './room.setting.vue';
import RoomGame from './room.game.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { useStream } from '@/stream.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const $i = ensureSignin();

const router = useRouter();

const props = defineProps<{
	roomId: string;
}>();

const room = shallowRef<Misskey.entities.MahjongRoomDetailed | null>(null);
const connection = shallowRef<Misskey.IChannelConnection<Misskey.Channels['mahjongRoom']> | null>(null);

watch(() => props.roomId, () => {
	fetchGame();
});

function start(_room: Misskey.entities.MahjongRoomDetailed) {
	room.value = _room;
}

async function fetchGame() {
	try {
		const _room = await misskeyApi('mahjong/join-room', {
			roomId: props.roomId,
		});

		room.value = _room;
	} catch (err) {
		console.error(err);
		await os.alert({
			type: 'warning',
			text: 'ルームに参加できませんでした。対局が開始されているか、ルームが存在しない可能性があります。',
		});
		router.pushByPath('/mahjong');
		return;
	}

	if (connection.value) {
		connection.value.dispose();
		connection.value = null;
	}
	if (!room.value.isEnded) {
		connection.value = useStream().useChannel('mahjongRoom', {
			roomId: room.value.id,
		});
		connection.value.on('started', x => {
			start(x.room);
		});
		connection.value.on('canceled', x => {
			connection.value?.dispose();
			connection.value = null;

			if (x.userId !== $i.id) {
				os.alert({
					type: 'warning',
					text: i18n.ts._mahjong.roomCanceled,
				});
				router.pushByPath('/mahjong');
			}
		});
	}
}

// 通信を取りこぼした場合の救済
useInterval(async () => {
	if (room.value == null) return;
	if (room.value.isStarted) return;

	const _room = await misskeyApi('mahjong/show-room', {
		roomId: props.roomId,
	});

	if (_room.isStarted || _room.isEnded) {
		start(_room);
	} else {
		room.value = _room;
	}
}, 1000 * 5, {
	immediate: false,
	afterMounted: true,
});

onMounted(() => {
	fetchGame();
});

onUnmounted(() => {
	if (connection.value) {
		connection.value.dispose();
	}
});

definePage(computed(() => ({
	title: i18n.ts._mahjong.mahjong,
	icon: 'ti ti-device-gamepad',
})));
</script>
