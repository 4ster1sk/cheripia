/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import * as Mmj from 'misskey-mahjong';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { buildRonnedHandTiles } from '@/misc/mahjong-stream-mask.js';
import { IdService } from '@/core/IdService.js';
import { Packed } from '@/misc/json-schema.js';
import type { OnApplicationShutdown } from '@nestjs/common';

export type MahjongRoom = {
	id: string;
	createdAt: string;
	startedAt: string | null;
	endedAt: string | null;
	isStarted: boolean;
	isEnded: boolean;
	user1Id: string;
	user2Id: string | null;
	user3Id: string | null;
	user4Id: string | null;
	user1: Packed<'UserLite'> | null;
	user2: Packed<'UserLite'> | null;
	user3: Packed<'UserLite'> | null;
	user4: Packed<'UserLite'> | null;
	user1Ai: boolean;
	user2Ai: boolean;
	user3Ai: boolean;
	user4Ai: boolean;
	user1Ready: boolean;
	user2Ready: boolean;
	user3Ready: boolean;
	user4Ready: boolean;
	timeLimitForEachTurn: number;

	gameState?: Mmj.MasterState;
};

type CallingAnswers = {
	pon: Record<Mmj.House, boolean | null>;
	cii: null | false | 'x__' | '_x_' | '__x';
	kan: Record<Mmj.House, boolean | null>;
	ron: {
		e: null | boolean;
		s: null | boolean;
		w: null | boolean;
		n: null | boolean;
	};
};

type NextKyokuConfirmation = {
	user1: boolean;
	user2: boolean;
	user3: boolean;
	user4: boolean;
};

function getSlotOfUserId(room: MahjongRoom, userId: MiUser['id']): 1 | 2 | 3 | 4 | null {
	if (userId === room.user1Id) return 1;
	if (userId === room.user2Id) return 2;
	if (userId === room.user3Id) return 3;
	if (userId === room.user4Id) return 4;
	return null;
}

function getHouseOfUserId(room: MahjongRoom, mj: Mmj.MasterGameEngine, userId: MiUser['id']): Mmj.House {
	if (userId === room.user1Id) return mj.user1House;
	if (userId === room.user2Id) return mj.user2House;
	if (userId === room.user3Id) return mj.user3House;
	if (userId === room.user4Id) return mj.user4House;
	throw new Error('user is not a member of the room');
}

/**
 * チーのパターンと捨て牌から、成立に必要な順子を返す
 */
function getCiiTilesForPattern(pattern: 'x__' | '_x_' | '__x', targetTile: Mmj.TileType): [Mmj.TileType, Mmj.TileType, Mmj.TileType] | null {
	switch (pattern) {
		case 'x__': {
			const next1 = Mmj.NEXT_TILE_FOR_SHUNTSU[targetTile];
			const next2 = next1 != null ? Mmj.NEXT_TILE_FOR_SHUNTSU[next1] : null;
			return next1 != null && next2 != null ? [targetTile, next1, next2] : null;
		}
		case '_x_': {
			const prev1 = Mmj.PREV_TILE_FOR_SHUNTSU[targetTile];
			const next1 = Mmj.NEXT_TILE_FOR_SHUNTSU[targetTile];
			return prev1 != null && next1 != null ? [prev1, targetTile, next1] : null;
		}
		case '__x': {
			const prev1 = Mmj.PREV_TILE_FOR_SHUNTSU[targetTile];
			const prev2 = prev1 != null ? Mmj.PREV_TILE_FOR_SHUNTSU[prev1] : null;
			return prev1 != null && prev2 != null ? [prev2, prev1, targetTile] : null;
		}
		default:
			return null;
	}
}

function getLastHoDiscardTileType(mj: Mmj.MasterGameEngine, callee: Mmj.House): Mmj.TileType | null {
	return mj.hoTileTypes[callee].at(-1) ?? null;
}

/**
 * 1つの捨て牌に対して同じプレイヤーに複数の asking が発生することがある。
 * プレイヤーが1つを選択したら、同じプレイヤーに発生している他の asking は辞退として扱う。
 * 他のプレイヤーの回答には触れない。
 */
function declineOtherAskingAnswers(
	answers: CallingAnswers,
	house: Mmj.House,
	mj: Mmj.MasterGameEngine,
	accepted: 'ron' | 'pon' | 'cii' | 'kan',
): void {
	if (accepted !== 'ron' && mj.askings.ron?.callers.includes(house)) {
		answers.ron[house] = false;
	}
	if (accepted !== 'pon' && mj.askings.pon?.callers.includes(house)) {
		answers.pon[house] = false;
	}
	if (accepted !== 'cii' && mj.askings.cii?.caller === house) {
		answers.cii = false;
	}
	if (accepted !== 'kan' && mj.askings.kan?.callers.includes(house)) {
		answers.kan[house] = false;
	}
}

/**
 * 旧形式（pon/kan が boolean | null）で保存された回答を新形式に寄せる。
 * デプロイ跨ぎの asking が残っていた場合のクラッシュを防ぐためのもので、
 * 旧値の真偽は引き継がず未回答として扱う。
 */
function normalizeCallingAnswers(answers: CallingAnswers): void {
	if (answers.pon == null || typeof answers.pon !== 'object') {
		answers.pon = { e: null, s: null, w: null, n: null };
	}
	if (answers.kan == null || typeof answers.kan !== 'object') {
		answers.kan = { e: null, s: null, w: null, n: null };
	}
}

@Injectable()
export class MahjongService implements OnApplicationShutdown {
	private readonly turnTimers = new Map<string, Set<NodeJS.Timeout>>();
	private readonly otherTimers = new Map<string, Set<NodeJS.Timeout>>();

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private userEntityService: UserEntityService,
		private globalEventService: GlobalEventService,
		private idService: IdService,
	) {
	}

	private readonly roomLocks = new Map<string, Promise<unknown>>();

	@bindThis
	private async withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
		const previous = (this.roomLocks.get(roomId) ?? Promise.resolve()).catch(() => {});
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);
		const queued = previous.then(() => gate);
		this.roomLocks.set(roomId, queued);
		await previous;
		try {
			return await fn();
		} finally {
			release();
			if (this.roomLocks.get(roomId) === queued) this.roomLocks.delete(roomId);
		}
	}

	@bindThis
	private addTimer(map: Map<string, Set<NodeJS.Timeout>>, roomId: string, timer: NodeJS.Timeout) {
		let timers = map.get(roomId);
		if (timers == null) {
			timers = new Set();
			map.set(roomId, timers);
		}
		timers.add(timer);
	}

	@bindThis
	private removeTimer(map: Map<string, Set<NodeJS.Timeout>>, roomId: string, timer: NodeJS.Timeout) {
		map.get(roomId)?.delete(timer);
	}

	@bindThis
	private clearTimers(map: Map<string, Set<NodeJS.Timeout>>, roomId: string) {
		const timers = map.get(roomId);
		if (timers == null) return;
		for (const timer of timers) {
			clearTimeout(timer);
			clearInterval(timer);
		}
		timers.clear();
	}

	@bindThis
	private clearTurnTimers(roomId: string) {
		this.clearTimers(this.turnTimers, roomId);
	}

	@bindThis
	private clearAllTimers(roomId: string) {
		this.clearTimers(this.turnTimers, roomId);
		this.clearTimers(this.otherTimers, roomId);
	}

	@bindThis
	private async saveRoom(room: MahjongRoom) {
		await this.redisClient.set(`mahjong:room:${room.id}`, JSON.stringify(room), 'EX', 60 * 30);
	}

	@bindThis
	private async deleteRoom(roomId: string) {
		this.clearAllTimers(roomId);
		await this.redisClient.del(`mahjong:room:${roomId}`);
	}

	@bindThis
	public async createRoom(user: MiUser): Promise<MahjongRoom> {
		const room: MahjongRoom = {
			id: this.idService.gen(),
			createdAt: new Date().toISOString(),
			startedAt: null,
			endedAt: null,
			isStarted: false,
			isEnded: false,
			user1Id: user.id,
			user2Id: null,
			user3Id: null,
			user4Id: null,
			user1: await this.userEntityService.pack(user),
			user2: null,
			user3: null,
			user4: null,
			user1Ai: false,
			user2Ai: false,
			user3Ai: false,
			user4Ai: false,
			user1Ready: false,
			user2Ready: false,
			user3Ready: false,
			user4Ready: false,
			timeLimitForEachTurn: 30,
		};
		await this.saveRoom(room);
		return room;
	}

	@bindThis
	public async getRoom(id: MahjongRoom['id']): Promise<MahjongRoom | null> {
		const room = await this.redisClient.get(`mahjong:room:${id}`);
		if (room == null) return null;
		return JSON.parse(room) as MahjongRoom;
	}

	@bindThis
	public async getActiveRooms(): Promise<MahjongRoom[]> {
		const keys = await this.redisClient.keys('*mahjong:room:*');
		const rooms: MahjongRoom[] = [];
		for (const key of keys) {
			// ioredis の keyPrefix が付与されているため、mahjong:room: 以降を roomId として扱う
			const index = key.indexOf('mahjong:room:');
			if (index === -1) continue;
			const room = await this.getRoom(key.slice(index + 'mahjong:room:'.length));
			if (room == null) continue;
			if (room.isStarted && !room.isEnded) rooms.push(room);
		}
		return rooms.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	@bindThis
	public isMember(room: MahjongRoom, user: MiUser): boolean {
		return getSlotOfUserId(room, user.id) != null;
	}

	@bindThis
	public getHouseOfUser(room: MahjongRoom, user: MiUser): Mmj.House | null {
		if (room.gameState == null) return null;
		const slot = getSlotOfUserId(room, user.id);
		if (slot == null) return null;
		const mj = new Mmj.MasterGameEngine(room.gameState);
		return mj.getHouse(slot);
	}

	@bindThis
	public async joinRoom(roomId: MahjongRoom['id'], user: MiUser): Promise<MahjongRoom | null> {
		return await this.withRoomLock(roomId, () => this.joinRoomLocked(roomId, user));
	}

	private async joinRoomLocked(roomId: MahjongRoom['id'], user: MiUser): Promise<MahjongRoom | null> {
		const room = await this.getRoom(roomId);
		if (room == null) return null;
		if (this.isMember(room, user)) return room;
		if (room.isStarted) return null;

		const packed = await this.userEntityService.pack(user);

		const tryJoin = async (index: 1 | 2 | 3 | 4): Promise<boolean> => {
			const idKey = `user${index}Id` as const;
			const aiKey = `user${index}Ai` as const;
			const readyKey = `user${index}Ready` as const;
			const userKey = `user${index}` as const;
			if (room[idKey] != null) return false;
			room[idKey] = user.id;
			room[userKey] = packed;
			room[aiKey] = false;
			room[readyKey] = false;
			await this.saveRoom(room);
			this.globalEventService.publishMahjongRoomStream(room.id, 'joined', { index, user: packed });
			return true;
		};

		for (const index of [2, 3, 4] as const) {
			if (await tryJoin(index)) return room;
		}

		return null;
	}

	@bindThis
	public async addAi(roomId: MahjongRoom['id'], user: MiUser): Promise<MahjongRoom | null> {
		return await this.withRoomLock(roomId, () => this.addAiLocked(roomId, user));
	}

	private async addAiLocked(roomId: MahjongRoom['id'], user: MiUser): Promise<MahjongRoom | null> {
		const room = await this.getRoom(roomId);
		if (room == null) return null;
		if (room.user1Id !== user.id) throw new Error('access denied');
		if (room.isStarted || room.isEnded) return null;

		for (const index of [2, 3, 4] as const) {
			const idKey = `user${index}Id` as const;
			const aiKey = `user${index}Ai` as const;
			const readyKey = `user${index}Ready` as const;
			if (room[idKey] == null && !room[aiKey]) {
				room[aiKey] = true;
				room[readyKey] = true;
				await this.saveRoom(room);
				this.globalEventService.publishMahjongRoomStream(room.id, 'joined', { index, user: null });
				await this.checkAllReady(room);
				return room;
			}
		}

		return null;
	}

	@bindThis
	public async removeAi(roomId: MahjongRoom['id'], user: MiUser, index: 2 | 3 | 4): Promise<MahjongRoom | null> {
		return await this.withRoomLock(roomId, () => this.removeAiLocked(roomId, user, index));
	}

	private async removeAiLocked(roomId: MahjongRoom['id'], user: MiUser, index: 2 | 3 | 4): Promise<MahjongRoom | null> {
		const room = await this.getRoom(roomId);
		if (room == null) return null;
		if (room.user1Id !== user.id) throw new Error('access denied');
		if (room.isStarted || room.isEnded) return null;

		const idKey = `user${index}Id` as const;
		const aiKey = `user${index}Ai` as const;
		const readyKey = `user${index}Ready` as const;
		if (room[idKey] != null || !room[aiKey]) return null;

		room[aiKey] = false;
		room[readyKey] = false;
		await this.saveRoom(room);

		this.globalEventService.publishMahjongRoomStream(room.id, 'left', { index });
		this.globalEventService.publishMahjongRoomStream(room.id, 'changeReadyStates', {
			user1: room.user1Ready,
			user2: room.user2Ready,
			user3: room.user3Ready,
			user4: room.user4Ready,
		});
		return room;
	}

	@bindThis
	public async leaveRoom(roomId: MahjongRoom['id'], user: MiUser): Promise<MahjongRoom | null> {
		return await this.withRoomLock(roomId, () => this.leaveRoomLocked(roomId, user));
	}

	private async leaveRoomLocked(roomId: MahjongRoom['id'], user: MiUser): Promise<MahjongRoom | null> {
		const room = await this.getRoom(roomId);
		if (room == null) return null;
		if (room.isStarted) return null;

		const slot = getSlotOfUserId(room, user.id);
		if (slot == null) return null;

		if (slot === 1) {
			await this.deleteRoom(room.id);
			this.globalEventService.publishMahjongRoomStream(room.id, 'canceled', { userId: user.id });
			return null;
		}

		const idKey = `user${slot}Id` as const;
		const aiKey = `user${slot}Ai` as const;
		const readyKey = `user${slot}Ready` as const;
		const userKey = `user${slot}` as const;
		room[idKey] = null;
		room[userKey] = null;
		room[aiKey] = false;
		room[readyKey] = false;
		await this.saveRoom(room);
		this.globalEventService.publishMahjongRoomStream(room.id, 'left', { index: slot });
		this.globalEventService.publishMahjongRoomStream(room.id, 'changeReadyStates', {
			user1: room.user1Ready,
			user2: room.user2Ready,
			user3: room.user3Ready,
			user4: room.user4Ready,
		});
		return room;
	}

	@bindThis
	public async updateSettings(roomId: MahjongRoom['id'], user: MiUser, key: string, value: unknown): Promise<void> {
		return await this.withRoomLock(roomId, () => this.updateSettingsLocked(roomId, user, key, value));
	}

	private async updateSettingsLocked(roomId: MahjongRoom['id'], user: MiUser, key: string, value: unknown): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.user1Id !== user.id) return;
		if (room.isStarted) return;

		if (key === 'timeLimitForEachTurn') {
			if (typeof value !== 'number' || !Number.isInteger(value) || value < 5 || value > 300) return;
			room.timeLimitForEachTurn = value;
			await this.saveRoom(room);
		}
	}

	@bindThis
	public async changeReadyState(roomId: MahjongRoom['id'], user: MiUser, ready: boolean): Promise<void> {
		return await this.withRoomLock(roomId, () => this.changeReadyStateLocked(roomId, user, ready));
	}

	private async changeReadyStateLocked(roomId: MahjongRoom['id'], user: MiUser, ready: boolean): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.isStarted || room.isEnded) return;

		const slot = getSlotOfUserId(room, user.id);
		if (slot == null) return;

		const readyKey = `user${slot}Ready` as const;
		room[readyKey] = ready;
		await this.saveRoom(room);

		this.globalEventService.publishMahjongRoomStream(room.id, 'changeReadyStates', {
			user1: room.user1Ready,
			user2: room.user2Ready,
			user3: room.user3Ready,
			user4: room.user4Ready,
		});

		await this.checkAllReady(room);
	}

	@bindThis
	private async checkAllReady(room: MahjongRoom): Promise<void> {
		if (room.isStarted || room.isEnded) return;
		const participantsReady =
			(room.user1Id != null || room.user1Ai) && room.user1Ready &&
			(room.user2Id != null || room.user2Ai) && room.user2Ready &&
			(room.user3Id != null || room.user3Ai) && room.user3Ready &&
			(room.user4Id != null || room.user4Ai) && room.user4Ready;
		if (!participantsReady) return;
		await this.startGame(room);
	}

	@bindThis
	private async startGame(room: MahjongRoom): Promise<void> {
		if (room.isStarted) return;
		room.gameState = Mmj.MasterGameEngine.createInitialState();
		room.isStarted = true;
		room.startedAt = new Date().toISOString();
		await this.saveRoom(room);

		this.globalEventService.publishMahjongRoomStream(room.id, 'started', { room });

		this.kyokuStarted(room);
	}

	@bindThis
	private kyokuStarted(room: MahjongRoom): void {
		if (room.gameState == null) return;
		const mj = new Mmj.MasterGameEngine(room.gameState);
		if (mj.turn == null) return;
		this.waitForTurn(room, mj.turn, mj);
	}

	@bindThis
	private getAiHouses(room: MahjongRoom, mj: Mmj.MasterGameEngine): Mmj.House[] {
		const houses: Mmj.House[] = [];
		if (room.user1Ai) houses.push(mj.user1House);
		if (room.user2Ai) houses.push(mj.user2House);
		if (room.user3Ai) houses.push(mj.user3House);
		if (room.user4Ai) houses.push(mj.user4House);
		return houses;
	}

	@bindThis
	private async answer(room: MahjongRoom, mj: Mmj.MasterGameEngine, answers: CallingAnswers): Promise<void> {
		const res = mj.commit_resolveCallingInterruption({
			pon: { ...answers.pon },
			cii: answers.cii ?? false,
			kan: { ...answers.kan },
			ron: [...(answers.ron.e ? ['e'] : []), ...(answers.ron.s ? ['s'] : []), ...(answers.ron.w ? ['w'] : []), ...(answers.ron.n ? ['n'] : [])] as Mmj.House[],
		});
		room.gameState = mj.getState();
		await this.saveRoom(room);

		switch (res.type) {
			case 'tsumo':
				this.globalEventService.publishMahjongRoomStream(room.id, 'tsumo', { house: res.house, tile: res.tile });
				this.waitForTurn(room, res.turn, mj);
				break;
			case 'ponned':
				this.globalEventService.publishMahjongRoomStream(room.id, 'ponned', { caller: res.caller, callee: res.callee, tiles: res.tiles });
				this.waitForTurn(room, res.turn, mj);
				break;
			case 'kanned':
				this.globalEventService.publishMahjongRoomStream(room.id, 'kanned', { caller: res.caller, callee: res.callee, tiles: res.tiles, rinsyan: res.rinsyan, doraIndicateTiles: mj.doraIndicateTiles });
				this.waitForTurn(room, res.turn, mj);
				break;
			case 'ciied':
				this.globalEventService.publishMahjongRoomStream(room.id, 'ciied', { caller: res.caller, callee: res.callee, tiles: res.tiles });
				this.waitForTurn(room, res.turn, mj);
				break;
			case 'ronned':
				this.globalEventService.publishMahjongRoomStream(room.id, 'ronned', {
					callers: res.callers,
					callee: res.callee,
					handTiles: buildRonnedHandTiles({
						e: mj.handTiles.e,
						s: mj.handTiles.s,
						w: mj.handTiles.w,
						n: mj.handTiles.n,
					}, res.callers),
				});
				await this.endKyoku(room, mj, { agariHouse: Mmj.findAtamahane(res.callee, res.callers), tenpaiHouses: [] });
				break;
			case 'ryuukyoku': {
				const ryuukyokuResult = mj.commit_ryuukyoku();
				room.gameState = mj.getState();
				await this.saveRoom(room);
				this.globalEventService.publishMahjongRoomStream(room.id, 'ryuukyoku', ryuukyokuResult);
				await this.endKyoku(room, mj, { agariHouse: null, tenpaiHouses: ryuukyokuResult.tenpaiHouses });
				break;
			}
		}
	}

	@bindThis
	private async endKyoku(room: MahjongRoom, mj: Mmj.MasterGameEngine, kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] }): Promise<void> {
		this.clearTurnTimers(room.id);

		const confirmation: NextKyokuConfirmation = {
			user1: room.user1Ai,
			user2: room.user2Ai,
			user3: room.user3Ai,
			user4: room.user4Ai,
		};
		await this.redisClient.set(`mahjong:gameNextKyokuConfirmation:${room.id}`, JSON.stringify(confirmation));
		const waitingStartedAt = Date.now();
		const interval = setInterval(async () => {
			const confirmationRaw = await this.redisClient.get(`mahjong:gameNextKyokuConfirmation:${room.id}`);
			if (confirmationRaw == null) {
				clearInterval(interval);
				this.removeTimer(this.otherTimers, room.id, interval);
				return;
			}
			const current = JSON.parse(confirmationRaw) as NextKyokuConfirmation;
			const allConfirmed = current.user1 && current.user2 && current.user3 && current.user4;
			if (allConfirmed || (Date.now() - waitingStartedAt > Mmj.NEXT_KYOKU_CONFIRMATION_TIMEOUT_MS)) {
				clearInterval(interval);
				this.removeTimer(this.otherTimers, room.id, interval);
				await this.redisClient.del(`mahjong:gameNextKyokuConfirmation:${room.id}`);
				try {
					await this.nextKyoku(room, mj, kyokuResult);
				} catch (err) {
					console.error('mahjong: failed to nextKyoku', err);
				}
			}
		}, 500);
		this.addTimer(this.otherTimers, room.id, interval);
	}

	@bindThis
	private async nextKyoku(room: MahjongRoom, mj: Mmj.MasterGameEngine, kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] }): Promise<void> {
		// トビ終了: いずれかの持ち点が0以下なら次局に進まず対局終了する
		if (Mmj.isTobiPoints(mj.$state.points)) {
			await this.endGame(room);
			return;
		}
		// オーラス止め（和了止め）は実装しない。南4局の親流れは単純終了する。
		const { ended } = mj.commit_nextKyoku(kyokuResult.agariHouse, kyokuResult.tenpaiHouses);
		if (ended) {
			await this.endGame(room);
			return;
		}
		room.gameState = mj.getState();

		await this.saveRoom(room);
		this.globalEventService.publishMahjongRoomStream(room.id, 'nextKyoku', { room });
		this.kyokuStarted(room);
	}

	@bindThis
	private async endGame(room: MahjongRoom): Promise<void> {
		this.clearAllTimers(room.id);
		room.isEnded = true;
		room.endedAt = new Date().toISOString();
		await this.saveRoom(room);
		this.globalEventService.publishMahjongRoomStream(room.id, 'ended', { room });
	}

	@bindThis
	private async dahai(room: MahjongRoom, mj: Mmj.MasterGameEngine, house: Mmj.House, tile: Mmj.TileId, riichi = false): Promise<void> {
		const res = mj.commit_dahai(house, tile, riichi);
		room.gameState = mj.getState();
		await this.clearTurnWaitingTimer(room.id);
		await this.saveRoom(room);

		const aiHouses = this.getAiHouses(room, mj);

		if (res.ryuukyoku) {
			const ryuukyokuResult = mj.commit_ryuukyoku();
			room.gameState = mj.getState();
			await this.saveRoom(room);
			// asking を伴わない流局では、最後の捨て牌もクライアントへ通知する
			// asking を伴う場合は asking 分岐で解決前に dahai を publish 済み
			this.globalEventService.publishMahjongRoomStream(room.id, 'dahai', { house, tile, riichi });
			this.globalEventService.publishMahjongRoomStream(room.id, 'ryuukyoku', ryuukyokuResult);
			await this.endKyoku(room, mj, { agariHouse: null, tenpaiHouses: ryuukyokuResult.tenpaiHouses });
			return;
		}

		if (res.asking) {
			const answers: CallingAnswers = {
				pon: { e: null, s: null, w: null, n: null },
				cii: null,
				kan: { e: null, s: null, w: null, n: null },
				ron: {
					e: null,
					s: null,
					w: null,
					n: null,
				},
			};

			const canPonHouses: Mmj.House[] = res.canPonHouses;
			const canKanHouses: Mmj.House[] = res.canKanHouses;
			// リーチ中はポン、チー、カンできない
			for (const h of canPonHouses) {
				if (mj.riichis[h]) answers.pon[h] = false;
			}
			if (res.canCiiHouse != null) {
				answers.cii = mj.riichis[res.canCiiHouse] ? false : null;
			}
			for (const h of canKanHouses) {
				if (mj.riichis[h]) answers.kan[h] = false;
			}

			for (const h of canPonHouses) {
				if (!mj.riichis[h] && aiHouses.includes(h)) {
					answers.pon[h] = Math.random() < 0.5;
				}
			}
			if (res.canCiiHouse != null && aiHouses.includes(res.canCiiHouse)) {
				answers.cii = false;
			}
			for (const h of canKanHouses) {
				if (!mj.riichis[h] && aiHouses.includes(h)) {
					answers.kan[h] = Math.random() < 0.5;
				}
			}
			for (const h of res.canRonHouses) {
				if (aiHouses.includes(h)) {
					answers.ron[h] = true;
				}
			}

			await this.redisClient.set(`mahjong:gameCallingAsking:${room.id}`, JSON.stringify(answers));
			const waitingStartedAt = Date.now();
			const interval = setInterval(async () => {
				const current = await this.redisClient.get(`mahjong:gameCallingAsking:${room.id}`);
				if (current == null) {
					clearInterval(interval);
					this.removeTimer(this.otherTimers, room.id, interval);
					return;
				}
				const currentAnswers = JSON.parse(current) as CallingAnswers;
				normalizeCallingAnswers(currentAnswers);
				const allAnswered = !(
					(canPonHouses.some(h => currentAnswers.pon[h] == null)) ||
					(res.canCiiHouse != null && currentAnswers.cii == null) ||
					(canKanHouses.some(h => currentAnswers.kan[h] == null)) ||
					(res.canRonHouses.includes('e') && currentAnswers.ron.e == null) ||
					(res.canRonHouses.includes('s') && currentAnswers.ron.s == null) ||
					(res.canRonHouses.includes('w') && currentAnswers.ron.w == null) ||
					(res.canRonHouses.includes('n') && currentAnswers.ron.n == null)
				);
				if (allAnswered || (Date.now() - waitingStartedAt > Mmj.CALL_AND_RON_ASKING_TIMEOUT_MS)) {
					clearInterval(interval);
					this.removeTimer(this.otherTimers, room.id, interval);
					await this.redisClient.del(`mahjong:gameCallingAsking:${room.id}`);
					// タイムアウト時は未回答の caller 全員を辞退扱いにする
					for (const h of canPonHouses) {
						if (currentAnswers.pon[h] == null) currentAnswers.pon[h] = false;
					}
					for (const h of canKanHouses) {
						if (currentAnswers.kan[h] == null) currentAnswers.kan[h] = false;
					}
					try {
						await this.answer(room, mj, currentAnswers);
					} catch (err) {
						console.error('mahjong: failed to resolve asking', err);
					}
				}
			}, 500);
			this.addTimer(this.otherTimers, room.id, interval);

			this.globalEventService.publishMahjongRoomStream(room.id, 'dahai', { house, tile, riichi });
			return;
		}

		this.globalEventService.publishMahjongRoomStream(room.id, 'dahaiAndTsumo', { dahaiHouse: house, dahaiTile: tile, tsumoTile: res.tsumoTile, riichi });
		this.waitForTurn(room, res.next, mj);
	}

	@bindThis
	private async tsumoHoraByHouse(room: MahjongRoom, mj: Mmj.MasterGameEngine, house: Mmj.House): Promise<void> {
		const res = mj.commit_tsumoHora(house);
		room.gameState = mj.getState();
		await this.clearTurnWaitingTimer(room.id);
		await this.saveRoom(room);

		this.globalEventService.publishMahjongRoomStream(room.id, 'tsumoHora', { house, handTiles: res.handTiles, tsumoTile: res.tsumoTile });
		await this.endKyoku(room, mj, { agariHouse: house, tenpaiHouses: [] });
	}

	@bindThis
	private async waitForTurn(room: MahjongRoom, house: Mmj.House, mj: Mmj.MasterGameEngine): Promise<void> {
		const aiHouses = this.getAiHouses(room, mj);

		if (aiHouses.includes(house)) {
			if (Mmj.isAgarikei(mj.handTileTypes[house])) {
				const timer = setTimeout(() => {
					void this.tsumoHoraByHouse(room, mj, house).catch(async (err) => {
						console.error('mahjong: AI failed to tsumoHora, discarding instead', err);
						const handTiles = mj.handTiles[house];
						await this.dahai(room, mj, house, handTiles.at(-1)!).catch(e => console.error('mahjong: AI failed to dahai', e));
					});
				}, 500);
				this.addTimer(this.turnTimers, room.id, timer);
				return;
			}

			const timer = setTimeout(() => {
				const handTiles = mj.handTiles[house];
				void this.dahai(room, mj, house, handTiles.at(-1)!).catch(err => console.error('mahjong: AI failed to dahai', err));
			}, 500);
			this.addTimer(this.turnTimers, room.id, timer);
			return;
		}

		if (mj.riichis[house]) {
			// リーチ時はアガリ牌でない限りツモ切り
			if (!Mmj.isAgarikei(mj.handTileTypes[house])) {
				const timer = setTimeout(() => {
					const handTiles = mj.handTiles[house];
					void this.dahai(room, mj, house, handTiles.at(-1)!).catch(err => console.error('mahjong: failed to dahai after riichi', err));
				}, 500);
				this.addTimer(this.turnTimers, room.id, timer);
				return;
			}
		}

		const id = Math.random().toString(36).slice(2);
		await this.redisClient.sadd(`mahjong:gameTurnWaiting:${room.id}`, id);
		const waitingStartedAt = Date.now();
		const timeoutMs = room.timeLimitForEachTurn * 1000;
		const interval = setInterval(async () => {
			const waiting = await this.redisClient.sismember(`mahjong:gameTurnWaiting:${room.id}`, id);
			if (waiting === 0) {
				clearInterval(interval);
				this.removeTimer(this.turnTimers, room.id, interval);
				return;
			}
			if (Date.now() - waitingStartedAt > timeoutMs) {
				await this.redisClient.srem(`mahjong:gameTurnWaiting:${room.id}`, id);
				clearInterval(interval);
				this.removeTimer(this.turnTimers, room.id, interval);
				const handTiles = mj.handTiles[house];
				try {
					await this.dahai(room, mj, house, handTiles.at(-1)!);
				} catch (err) {
					console.error('mahjong: failed to dahai on timeout', err);
				}
			}
		}, 500);
		this.addTimer(this.turnTimers, room.id, interval);
	}

	@bindThis
	public async confirmNextKyoku(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		return await this.withRoomLock(roomId, () => this.confirmNextKyokuLocked(roomId, user));
	}

	private async confirmNextKyokuLocked(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.gameState == null) return;

		const slot = getSlotOfUserId(room, user.id);
		if (slot == null) return;

		const confirmationRaw = await this.redisClient.get(`mahjong:gameNextKyokuConfirmation:${room.id}`);
		if (confirmationRaw == null) return;
		const confirmation = JSON.parse(confirmationRaw) as NextKyokuConfirmation;
		confirmation[`user${slot}` as keyof NextKyokuConfirmation] = true;
		await this.redisClient.set(`mahjong:gameNextKyokuConfirmation:${room.id}`, JSON.stringify(confirmation));
	}

	@bindThis
	public async commit_dahai(roomId: MahjongRoom['id'], user: MiUser, tile: Mmj.TileId, riichi = false): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.gameState == null) return;
		if (room.isEnded) return;

		const mj = new Mmj.MasterGameEngine(room.gameState);
		const myHouse = getHouseOfUserId(room, mj, user.id);

		try {
			await this.dahai(room, mj, myHouse, tile, riichi);
		} catch (err) {
			console.error('mahjong: failed to dahai', err);
		}
	}

	@bindThis
	public async commit_ankan(roomId: MahjongRoom['id'], user: MiUser, tile: Mmj.TileId): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.gameState == null) return;
		if (room.isEnded) return;

		const mj = new Mmj.MasterGameEngine(room.gameState);
		const myHouse = getHouseOfUserId(room, mj, user.id);

		try {
			const res = mj.commit_ankan(myHouse, tile);
			room.gameState = mj.getState();
			await this.clearTurnWaitingTimer(room.id);
			await this.saveRoom(room);
			this.globalEventService.publishMahjongRoomStream(room.id, 'ankanned', { house: myHouse, tiles: res.tiles, rinsyan: res.rinsyan, doraIndicateTiles: mj.doraIndicateTiles });
			this.waitForTurn(room, myHouse, mj);
		} catch (err) {
			console.error('mahjong: failed to ankan', err);
		}
	}

	@bindThis
	public async commit_kakan(roomId: MahjongRoom['id'], user: MiUser, tile: Mmj.TileId): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.gameState == null) return;
		if (room.isEnded) return;

		const mj = new Mmj.MasterGameEngine(room.gameState);
		const myHouse = getHouseOfUserId(room, mj, user.id);

		try {
			const res = mj.commit_kakan(myHouse, tile);
			room.gameState = mj.getState();
			await this.clearTurnWaitingTimer(room.id);
			await this.saveRoom(room);
			this.globalEventService.publishMahjongRoomStream(room.id, 'kakanned', { house: myHouse, tiles: res.tiles, rinsyan: res.rinsyan, from: res.from, doraIndicateTiles: mj.doraIndicateTiles });
			this.waitForTurn(room, myHouse, mj);
		} catch (err) {
			console.error('mahjong: failed to kakan', err);
		}
	}

	@bindThis
	public async commit_tsumoHora(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.gameState == null) return;
		if (room.isEnded) return;

		const mj = new Mmj.MasterGameEngine(room.gameState);
		const myHouse = getHouseOfUserId(room, mj, user.id);

		try {
			await this.tsumoHoraByHouse(room, mj, myHouse);
		} catch (err) {
			console.error('mahjong: failed to tsumoHora', err);
		}
	}

	@bindThis
	private async updateAnswer(roomId: MahjongRoom['id'], user: MiUser, update: (answers: CallingAnswers, house: Mmj.House, mj: Mmj.MasterGameEngine) => boolean): Promise<void> {
		return await this.withRoomLock(roomId, () => this.updateAnswerLocked(roomId, user, update));
	}

	private async updateAnswerLocked(roomId: MahjongRoom['id'], user: MiUser, update: (answers: CallingAnswers, house: Mmj.House, mj: Mmj.MasterGameEngine) => boolean): Promise<void> {
		const room = await this.getRoom(roomId);
		if (room == null) return;
		if (room.gameState == null) return;

		const mj = new Mmj.MasterGameEngine(room.gameState);
		const myHouse = getHouseOfUserId(room, mj, user.id);

		const current = await this.redisClient.get(`mahjong:gameCallingAsking:${room.id}`);
		if (current == null) return;
		const currentAnswers = JSON.parse(current) as CallingAnswers;
		normalizeCallingAnswers(currentAnswers);
		if (!update(currentAnswers, myHouse, mj)) return;
		await this.redisClient.set(`mahjong:gameCallingAsking:${room.id}`, JSON.stringify(currentAnswers));
	}

	@bindThis
	public async commit_ronHora(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		await this.updateAnswer(roomId, user, (answers, house, mj) => {
			if (mj.askings.ron == null || !mj.askings.ron.callers.includes(house)) return false;
			answers.ron[house] = true;
			// ロンを選択したら、同じプレイヤーのポン・チー・カンは辞退扱いにする
			declineOtherAskingAnswers(answers, house, mj, 'ron');
			return true;
		});
	}

	@bindThis
	public async commit_pon(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		await this.updateAnswer(roomId, user, (answers, house, mj) => {
			const asking = mj.askings.pon;
			if (asking == null || !asking.callers.includes(house)) return false;

			// リーチ中は鳴けない
			if (mj.riichis[house]) {
				answers.pon[house] = false;
				return true;
			}

			// クライアントの申告を信頼せず、手牌に2枚あることを再検証する
			const targetTile = getLastHoDiscardTileType(mj, asking.callee);
			if (targetTile == null || mj.handTileTypes[house].filter(t => t === targetTile).length < 2) {
				answers.pon[house] = false;
				return true;
			}

			answers.pon[house] = true;
			// ポンが成立したら、同じプレイヤーのロン・チー・カンは辞退扱いにする
			declineOtherAskingAnswers(answers, house, mj, 'pon');
			return true;
		});
	}

	@bindThis
	public async commit_kan(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		await this.updateAnswer(roomId, user, (answers, house, mj) => {
			const asking = mj.askings.kan;
			if (asking == null || !asking.callers.includes(house)) return false;

			// リーチ中は鳴けない
			if (mj.riichis[house]) {
				answers.kan[house] = false;
				return true;
			}

			// クライアントの申告を信頼せず、手牌に3枚あることを再検証する
			const targetTile = getLastHoDiscardTileType(mj, asking.callee);
			if (targetTile == null || mj.handTileTypes[house].filter(t => t === targetTile).length < 3) {
				answers.kan[house] = false;
				return true;
			}

			answers.kan[house] = true;
			// カンが成立したら、同じプレイヤーのロン・ポン・チーは辞退扱いにする
			declineOtherAskingAnswers(answers, house, mj, 'kan');
			return true;
		});
	}

	@bindThis
	public async commit_cii(roomId: MahjongRoom['id'], user: MiUser, pattern: 'x__' | '_x_' | '__x'): Promise<void> {
		await this.updateAnswer(roomId, user, (answers, house, mj) => {
			const asking = mj.askings.cii;
			if (asking == null || asking.caller !== house) return false;

			// リーチ中は鳴けない
			if (mj.riichis[house]) {
				answers.cii = false;
				return true;
			}

			// クライアントの申告したパターンが実際に成立するか検証する。
			// 不正なパターンでも例外を投げず、不成立として安全に解決する。
			const targetTile = getLastHoDiscardTileType(mj, asking.callee);
			if (targetTile == null) {
				answers.cii = false;
				return true;
			}
			const expectedTiles = getCiiTilesForPattern(pattern, targetTile);
			const availablePatterns = Mmj.getAvailableCiiPatterns(mj.handTileTypes[house], targetTile);
			const isValid = expectedTiles != null && availablePatterns.some(tiles =>
				tiles[0] === expectedTiles[0] && tiles[1] === expectedTiles[1] && tiles[2] === expectedTiles[2]);

			if (isValid) {
				answers.cii = pattern;
				// チーが成立したら、同じプレイヤーのロン・ポン・カンは辞退扱いにする
				declineOtherAskingAnswers(answers, house, mj, 'cii');
			} else {
				answers.cii = false;
			}
			return true;
		});
	}

	@bindThis
	public async commit_nop(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		await this.updateAnswer(roomId, user, (answers, house, mj) => {
			let updated = false;
			if (mj.askings.pon?.callers.includes(house)) {
				answers.pon[house] = false;
				updated = true;
			}
			if (mj.askings.cii?.caller === house) {
				answers.cii = false;
				updated = true;
			}
			if (mj.askings.kan?.callers.includes(house)) {
				answers.kan[house] = false;
				updated = true;
			}
			if (mj.askings.ron?.callers.includes(house)) {
				answers.ron[house] = false;
				updated = true;
			}
			return updated;
		});
	}

	/**
	 * プレイヤーの行動(打牌、加槓、暗槓、ツモ和了)が行われたときに呼ぶ
	 */
	@bindThis
	private async clearTurnWaitingTimer(roomId: MahjongRoom['id']): Promise<void> {
		this.clearTurnTimers(roomId);
		await this.redisClient.del(`mahjong:gameTurnWaiting:${roomId}`);
	}

	@bindThis
	public packState(room: MahjongRoom, me: MiUser): Mmj.PlayerState {
		if (room.gameState == null) throw new Error('game is not started');
		const mj = new Mmj.MasterGameEngine(room.gameState);
		const slot = getSlotOfUserId(room, me.id);
		if (slot == null) throw new Error('user is not a member of the room');
		return mj.createPlayerState(slot);
	}

	@bindThis
	public async packRoom(room: MahjongRoom, me: MiUser): Promise<Packed<'MahjongRoomDetailed'>> {
		return {
			...room,
			gameState: room.gameState != null ? this.packState(room, me) : null,
		} as Packed<'MahjongRoomDetailed'>;
	}

	@bindThis
	public async packRoomSummary(room: MahjongRoom): Promise<Packed<'MahjongRoomDetailed'>> {
		return {
			...room,
			gameState: null,
		} as Packed<'MahjongRoomDetailed'>;
	}

	@bindThis
	public async packSpectatorRoom(room: MahjongRoom): Promise<Packed<'MahjongRoomDetailed'>> {
		return {
			...room,
			gameState: room.gameState != null ? new Mmj.MasterGameEngine(room.gameState).createSpectatorState() : null,
		} as Packed<'MahjongRoomDetailed'>;
	}

	@bindThis
	public dispose(): void {
		for (const roomId of this.turnTimers.keys()) {
			this.clearTimers(this.turnTimers, roomId);
		}
		for (const roomId of this.otherTimers.keys()) {
			this.clearTimers(this.otherTimers, roomId);
		}
	}

	@bindThis
	public onApplicationShutdown(_signal?: string | undefined): void {
		this.dispose();
	}
}
