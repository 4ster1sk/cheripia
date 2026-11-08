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

		<div class="_panel" style="padding: 16px;">
			<div style="font-size: 90%; opacity: 0.8;">
				ルームを作成すると対局URLが発行されます。同じインスタンスのユーザーにURLを共有し、4人揃ったら全員が「準備完了」を押してください。人数が足りない場合はCPUを追加できます。
			</div>
		</div>
	</div>
</MkSpacer>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';

const router = useRouter();

async function joinRoom() {
	const { canceled, result } = await os.inputText({
		title: 'Room ID / URL',
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
