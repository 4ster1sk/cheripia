/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { nextHouse } from 'misskey-mahjong';
import { bindThis } from '@/decorators.js';
import { MahjongService } from '@/core/MahjongService.js';
import { maskAnkannedBodyForHouse } from '@/misc/mahjong-stream-mask.js';
import { GlobalEvents } from '@/core/GlobalEventService.js';
import { isJsonObject } from '@/misc/json-value.js';
import type { JsonObject, JsonValue } from '@/misc/json-value.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class MahjongRoomChannel extends Channel {
	public readonly chName = 'mahjongRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private roomId: string | null = null;
	private myHouse: 'e' | 's' | 'w' | 'n' | null = null;
	private spectator = false;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private mahjongService: MahjongService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject) {
		if (typeof params.roomId !== 'string') return;
		this.roomId = params.roomId;

		if (this.user == null) return;
		const room = await this.mahjongService.getRoom(this.roomId);
		if (room == null) return;

		if (this.mahjongService.isMember(room, this.user)) {
			this.myHouse = this.mahjongService.getHouseOfUser(room, this.user);
		} else if (room.isStarted && !room.isEnded) {
			this.spectator = true;
		} else {
			return;
		}

		this.subscriber.on(`mahjongRoomStream:${this.roomId}`, this.onMahjongRoomStreamMessage);

		if (this.spectator) {
			this.send('spectatorState', {
				room: await this.mahjongService.packSpectatorRoom(room),
			});
		}
	}

	@bindThis
	private async onMahjongRoomStreamMessage(message: GlobalEvents['mahjongRoom']['payload']) {
		if (this.user == null) return;

		if (this.spectator) {
			const room = await this.mahjongService.getRoom(this.roomId!);
			if (room == null) return;
			this.send('spectatorState', {
				room: await this.mahjongService.packSpectatorRoom(room),
			});
			return;
		}

		if (message.type === 'started' || message.type === 'nextKyoku' || message.type === 'ended') {
			if (message.type !== 'ended') {
				this.myHouse = this.mahjongService.getHouseOfUser(message.body.room, this.user);
			}
			const packed = await this.mahjongService.packRoom(message.body.room, this.user);
			this.send(message.type, {
				room: packed,
			});
		} else {
			let body = message.body as unknown as JsonValue;
			if (message.type === 'tsumo' && message.body.house !== this.myHouse) {
				body = { ...message.body, tile: 0 } as unknown as JsonValue;
			} else if (message.type === 'dahaiAndTsumo' && nextHouse(message.body.dahaiHouse) !== this.myHouse) {
				body = { ...message.body, tsumoTile: 0 } as unknown as JsonValue;
			} else if (message.type === 'kanned' && message.body.caller !== this.myHouse) {
				body = { ...message.body, rinsyan: 0 } as unknown as JsonValue;
			} else if (message.type === 'ankanned' && message.body.house !== this.myHouse) {
				body = maskAnkannedBodyForHouse(message.body, this.myHouse) as unknown as JsonValue;
			} else if (message.type === 'kakanned' && message.body.house !== this.myHouse) {
				body = { ...message.body, rinsyan: 0 } as unknown as JsonValue;
			}
			this.send(message.type, body);
		}
	}

	@bindThis
	public onMessage(type: string, body: JsonValue) {
		if (this.spectator) return;

		switch (type) {
			case 'ready':
				if (typeof body !== 'boolean') return;
				this.ready(body);
				break;
			case 'addAi':
				this.addAi();
				break;
			case 'updateSettings':
				if (!isJsonObject(body)) return;
				if (body.key === 'timeLimitForEachTurn') {
					if (typeof body.value !== 'number' || !Number.isInteger(body.value) || body.value < 5 || body.value > 300) return;
					this.updateSettings(body.key, body.value);
				} else if (body.key === 'matchLength') {
					if (body.value !== 'east' && body.value !== 'south') return;
					this.updateSettings(body.key, body.value);
				}
				break;
			case 'removeAi':
				if (!isJsonObject(body)) return;
				if (body.index !== 2 && body.index !== 3 && body.index !== 4) return;
				this.removeAi(body.index);
				break;
			case 'leave':
				this.leaveRoom();
				break;
			case 'confirmNextKyoku':
				this.confirmNextKyoku();
				break;
			case 'dahai':
				if (!isJsonObject(body)) return;
				if (typeof body.tile !== 'number') return;
				if (body.riichi != null && typeof body.riichi !== 'boolean') return;
				this.dahai(body.tile, body.riichi ?? false);
				break;
			case 'tsumoHora':
				this.tsumoHora();
				break;
			case 'ronHora':
				this.ronHora();
				break;
			case 'pon':
				this.pon();
				break;
			case 'cii':
				if (!isJsonObject(body)) return;
				if (body.pattern !== 'x__' && body.pattern !== '_x_' && body.pattern !== '__x') return;
				this.cii(body.pattern);
				break;
			case 'kan':
				this.kan();
				break;
			case 'ankan':
				if (!isJsonObject(body)) return;
				if (typeof body.tile !== 'number') return;
				this.ankan(body.tile);
				break;
			case 'kakan':
				if (!isJsonObject(body)) return;
				if (typeof body.tile !== 'number') return;
				this.kakan(body.tile);
				break;
			case 'nop':
				this.nop();
				break;
		}
	}

	@bindThis
	private async ready(ready: boolean) {
		if (this.user == null) return;
		await this.mahjongService.changeReadyState(this.roomId!, this.user, ready);
	}

	@bindThis
	private async confirmNextKyoku() {
		if (this.user == null) return;
		await this.mahjongService.confirmNextKyoku(this.roomId!, this.user);
	}

	@bindThis
	private async updateSettings(key: string, value: unknown) {
		if (this.user == null) return;
		await this.mahjongService.updateSettings(this.roomId!, this.user, key, value);
	}

	@bindThis
	private async addAi() {
		if (this.user == null) return;
		await this.mahjongService.addAi(this.roomId!, this.user);
	}

	@bindThis
	private async removeAi(index: 2 | 3 | 4) {
		if (this.user == null) return;
		await this.mahjongService.removeAi(this.roomId!, this.user, index);
	}

	@bindThis
	private async leaveRoom() {
		if (this.user == null) return;
		await this.mahjongService.leaveRoom(this.roomId!, this.user);
	}

	@bindThis
	private async dahai(tile: number, riichi = false) {
		if (this.user == null) return;
		await this.mahjongService.commit_dahai(this.roomId!, this.user, tile, riichi);
	}

	@bindThis
	private async tsumoHora() {
		if (this.user == null) return;
		await this.mahjongService.commit_tsumoHora(this.roomId!, this.user);
	}

	@bindThis
	private async ronHora() {
		if (this.user == null) return;
		await this.mahjongService.commit_ronHora(this.roomId!, this.user);
	}

	@bindThis
	private async pon() {
		if (this.user == null) return;
		await this.mahjongService.commit_pon(this.roomId!, this.user);
	}

	@bindThis
	private async cii(pattern: 'x__' | '_x_' | '__x') {
		if (this.user == null) return;
		await this.mahjongService.commit_cii(this.roomId!, this.user, pattern);
	}

	@bindThis
	private async kan() {
		if (this.user == null) return;
		await this.mahjongService.commit_kan(this.roomId!, this.user);
	}

	@bindThis
	private async ankan(tile: number) {
		if (this.user == null) return;
		await this.mahjongService.commit_ankan(this.roomId!, this.user, tile);
	}

	@bindThis
	private async kakan(tile: number) {
		if (this.user == null) return;
		await this.mahjongService.commit_kakan(this.roomId!, this.user, tile);
	}

	@bindThis
	private async nop() {
		if (this.user == null) return;
		await this.mahjongService.commit_nop(this.roomId!, this.user);
	}

	@bindThis
	public dispose() {
		if (this.roomId != null) {
			this.subscriber.off(`mahjongRoomStream:${this.roomId}`, this.onMahjongRoomStreamMessage);
		}
	}
}
