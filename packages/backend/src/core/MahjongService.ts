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
	/**
	 * 対局形式。'east' は東風戦（東4局で終了）、'south' は東南戦（南入あり。既定）。
	 * 対局開始前のルーム設定でのみ変更できる。
	 */
	matchLength: 'east' | 'south';

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

/**
 * 次局進行の冪等ガード用に、進行待ち開始時点の局を識別する。
 */
type NextKyokuKey = {
	round: Mmj.MasterState['round'];
	kyoku: number;
	turnCount: number;
};

type NextKyokuWaiting = {
	confirmation: NextKyokuConfirmation;
	kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] };
	expected: NextKyokuKey;
	token?: string;
};

function isSameNextKyokuKey(a: NextKyokuKey, b: NextKyokuKey): boolean {
	return a.round === b.round && a.kyoku === b.kyoku && a.turnCount === b.turnCount;
}

function isMahjongHouse(value: unknown): value is Mmj.House {
	return value === 'e' || value === 's' || value === 'w' || value === 'n';
}

function isMahjongRound(value: unknown): value is Mmj.MasterState['round'] {
	return value === 'e' || value === 's' || value === 'w' || value === 'n';
}

/**
 * Redis 補助キー (`gameCallingAsking` / `gameNextKyokuConfirmation` / `gameTurnWaiting`) の TTL (秒)。
 * 正規フローは asking 解決 (`timeLimitForEachTurn`)・次局確認 15 秒+α・手番待機は最大 300 秒 (`timeLimitForEachTurn` 上限) で
 * 自動進行するため、1 時間あれば十分な余裕がある。プロセス落ち・タイマー漏れ時のゴミ残留に上限を付ける。
 */
const AUX_KEY_TTL_SECONDS = 60 * 60;

/**
 * 次局待機キー（`mahjong:gameNextKyokuConfirmation`）から確認フラグを読む。
 * 新形式（待機レコード）・旧形式（確認フラグのみ）の双方を受け付ける。
 */
function parseNextKyokuConfirmation(raw: string): NextKyokuConfirmation | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (parsed == null || typeof parsed !== 'object') return null;
	const record = parsed as Record<string, unknown>;
	const candidate = (record.confirmation ?? parsed) as Record<string, unknown>;
	if (
		typeof candidate.user1 !== 'boolean' ||
		typeof candidate.user2 !== 'boolean' ||
		typeof candidate.user3 !== 'boolean' ||
		typeof candidate.user4 !== 'boolean'
	) return null;
	return candidate as unknown as NextKyokuConfirmation;
}

/**
 * 新形式の待機レコードを読む。旧形式・破損値は null。
 */
function parseNextKyokuWaiting(raw: string): NextKyokuWaiting | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (parsed == null || typeof parsed !== 'object') return null;
	const record = parsed as Record<string, unknown>;
	if (record.confirmation == null || typeof record.confirmation !== 'object') return null;
	const confirmation = parseNextKyokuConfirmation(raw);
	if (confirmation == null) return null;
	const kyokuResult = record.kyokuResult as { agariHouse?: unknown; tenpaiHouses?: unknown } | null | undefined;
	const expected = record.expected as { round?: unknown; kyoku?: unknown; turnCount?: unknown } | null | undefined;
	if (kyokuResult == null || typeof kyokuResult !== 'object') return null;
	if (!Array.isArray(kyokuResult.tenpaiHouses)) return null;
	if (!kyokuResult.tenpaiHouses.every(isMahjongHouse)) return null;
	if (kyokuResult.agariHouse != null && !isMahjongHouse(kyokuResult.agariHouse)) return null;
	if (expected == null || typeof expected !== 'object') return null;
	if (!isMahjongRound(expected.round)) return null;
	if (!Number.isInteger(expected.kyoku) || !Number.isInteger(expected.turnCount)) return null;
	return {
		confirmation,
		kyokuResult: {
			agariHouse: (kyokuResult.agariHouse ?? null) as Mmj.House | null,
			tenpaiHouses: kyokuResult.tenpaiHouses as Mmj.House[],
		},
		expected: {
			round: expected.round as Mmj.MasterState['round'],
			kyoku: expected.kyoku as number,
			turnCount: expected.turnCount as number,
		},
		token: typeof record.token === 'string' ? record.token : undefined,
	};
}

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
			matchLength: 'south',
		};
		await this.saveRoom(room);
		return room;
	}

	@bindThis
	public async getRoom(id: MahjongRoom['id']): Promise<MahjongRoom | null> {
		const room = await this.redisClient.get(`mahjong:room:${id}`);
		if (room == null) return null;
		const parsed = JSON.parse(room) as MahjongRoom;
		// matchLength 導入前の既存ルームは東南戦 ('south') 扱いとする。
		if (parsed.matchLength !== 'east' && parsed.matchLength !== 'south') {
			parsed.matchLength = 'south';
		}
		return parsed;
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

		if (key === 'matchLength') {
			if (value !== 'east' && value !== 'south') return;
			room.matchLength = value;
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
		room.gameState = Mmj.MasterGameEngine.createInitialState({ matchLength: room.matchLength ?? 'south' });
		room.isStarted = true;
		room.startedAt = new Date().toISOString();
		await this.saveRoom(room);

		this.globalEventService.publishMahjongRoomStream(room.id, 'started', { room });

		// 局開始時の親14枚が九種九牌なら中途流局とする。
		const mj = new Mmj.MasterGameEngine(room.gameState);
		try {
			mj.assertKyushuKyuhai();
		} catch (err) {
			if (err instanceof Mmj.AbortiveDrawError) {
				await this.abortiveDrawLocked(room, mj, err.kind);
				return;
			}
			throw err;
		}

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
	private async answerLocked(room: MahjongRoom, mj: Mmj.MasterGameEngine, answers: CallingAnswers): Promise<void> {
		const kakanRonTile = mj.getState().kakanRon?.tile ?? null;
		const wasKakanRon = kakanRonTile != null;
		let res: ReturnType<Mmj.MasterGameEngine['commit_resolveCallingInterruption']>;
		try {
			res = mj.commit_resolveCallingInterruption({
				pon: { ...answers.pon },
				cii: answers.cii ?? false,
				kan: { ...answers.kan },
				ron: [...(answers.ron.e ? ['e'] : []), ...(answers.ron.s ? ['s'] : []), ...(answers.ron.w ? ['w'] : []), ...(answers.ron.n ? ['n'] : [])] as Mmj.House[],
			});
		} catch (err) {
			if (err instanceof Mmj.AbortiveDrawError) {
				await this.abortiveDrawLocked(room, mj, err.kind);
				return;
			}
			throw err;
		}
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
			case 'kakanRinshan':
				this.globalEventService.publishMahjongRoomStream(room.id, 'kakanned', { house: res.house, tiles: res.tiles as readonly [number, number, number, number], rinsyan: res.rinsyan, from: res.from as Mmj.House, doraIndicateTiles: mj.doraIndicateTiles });
				this.waitForTurn(room, res.turn, mj);
				break;
			case 'ciied':
				this.globalEventService.publishMahjongRoomStream(room.id, 'ciied', { caller: res.caller, callee: res.callee, tiles: res.tiles });
				this.waitForTurn(room, res.turn, mj);
				break;
			case 'ronned': {
				let ronTile: number | undefined;
				let chankan: boolean | undefined;
				if (wasKakanRon) {
					const kakanHuro = mj.$state.huros[res.callee].find(h => h.type === 'minkan' && (h as { kakan?: boolean }).kakan === true && Mmj.findTileByIdOrFail(h.tiles[0]).t === kakanRonTile);
					if (kakanHuro != null) ronTile = kakanHuro.tiles[0] as number;
					chankan = true;
				}
				this.globalEventService.publishMahjongRoomStream(room.id, 'ronned', {
					callers: res.callers,
					callee: res.callee,
					handTiles: buildRonnedHandTiles({
						e: mj.handTiles.e,
						s: mj.handTiles.s,
						w: mj.handTiles.w,
						n: mj.handTiles.n,
					}, res.callers),
					...(ronTile != null ? { ronTile } : {}),
					...(chankan != null ? { chankan } : {}),
					uraDoraIndicateTiles: mj.uraDoraIndicateTiles,
				});
				await this.endKyoku(room, mj, { agariHouse: Mmj.findAtamahane(res.callee, res.callers), tenpaiHouses: [] });
				break;
			}
			case 'ryuukyoku': {
				const ryuukyokuResult = mj.commit_ryuukyoku();
				room.gameState = mj.getState();
				await this.saveRoom(room);
				this.globalEventService.publishMahjongRoomStream(room.id, 'ryuukyoku', ryuukyokuResult);
				// 流し満貫の成就時は親連荘とするため tenpaiHouses ['e'] で既存経路に乗せる
				// (commit_nextKyoku は親テンパイ流局で連荘する)。
				await this.endKyoku(room, mj, { agariHouse: null, tenpaiHouses: ryuukyokuResult.nagashiHouses.length > 0 ? ['e'] : ryuukyokuResult.tenpaiHouses });
				break;
			}
		}
	}

	@bindThis
	private async abortiveDrawLocked(room: MahjongRoom, mj: Mmj.MasterGameEngine, kind: Mmj.AbortiveDrawKind): Promise<void> {
		// NOTE: withRoomLock の内側で呼ぶこと。
		// 中途流局は標準ルールで親の連荘・本場+1・点数移動なし・供託据え置きとする（単純化）。
		// 既存の流局経路に乗せるため、親連荘となるよう tenpaiHouses ['e'] で endKyoku する
		//（commit_nextKyoku は親テンパイ流局で連荘する）。
		const result = mj.commit_abortiveDraw(kind);
		room.gameState = mj.getState();
		await this.saveRoom(room);
		this.globalEventService.publishMahjongRoomStream(room.id, 'ryuukyoku', result);
		await this.endKyoku(room, mj, { agariHouse: null, tenpaiHouses: ['e'] });
	}

	@bindThis
	private watchNextKyokuConfirmation(roomId: MahjongRoom['id'], expected: NextKyokuKey, kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] }): void {
		// NOTE: endKyoku の通常経路と同一待機抑止経路の双方から呼ぶ。キーの内容には触れず監視だけ追加する。
		const key = `mahjong:gameNextKyokuConfirmation:${roomId}`;
		const waitingStartedAt = Date.now();
		const interval = setInterval(async () => {
			// Redis 取得失敗時は interval を維持して次 tick で再試行する
			try {
				const confirmationRaw = await this.redisClient.get(key);
				if (confirmationRaw == null) {
					clearInterval(interval);
					this.removeTimer(this.otherTimers, roomId, interval);
					return;
				}
				const current = parseNextKyokuConfirmation(confirmationRaw);
				if (current == null) {
					// 破損値: interval を止めたうえで、クロージャの kyokuResult/expected で回復を試みる
					clearInterval(interval);
					this.removeTimer(this.otherTimers, roomId, interval);
					try {
						await this.withRoomLock(roomId, async () => {
							const latestRaw = await this.redisClient.get(key);
							if (latestRaw == null) return;
							// 復旧・上書きされていたらそちらに委ねる
							if (parseNextKyokuConfirmation(latestRaw) != null) return;
							const fresh = await this.getRoom(roomId);
							if (fresh == null || fresh.gameState == null) {
								await this.redisClient.del(key);
								return;
							}
							const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
							await this.nextKyokuLocked(fresh, freshMj, kyokuResult, expected);
							// ネスト中断で新待機に置き換わっていたら削除しない（token 付きの新待機は残す）。
							const afterRaw = await this.redisClient.get(key);
							if (afterRaw != null) {
								const after = parseNextKyokuWaiting(afterRaw);
								if (after == null || after.token == null) {
									await this.redisClient.del(key);
								}
							}
						});
					} catch (err) {
						console.error('mahjong: failed to recover nextKyoku waiting', err);
					}
					return;
				}
				// キーが別局の待機に置き換わっていたら、この interval は旧世代として自消する
				const currentWaiting = parseNextKyokuWaiting(confirmationRaw);
				if (currentWaiting != null && !isSameNextKyokuKey(currentWaiting.expected, expected)) {
					clearInterval(interval);
					this.removeTimer(this.otherTimers, roomId, interval);
					return;
				}
				const allConfirmed = current.user1 && current.user2 && current.user3 && current.user4;
				if (allConfirmed || (Date.now() - waitingStartedAt > Mmj.NEXT_KYOKU_CONFIRMATION_TIMEOUT_MS)) {
					let done = false;
					try {
						done = await this.withRoomLock(roomId, async () => {
							// 先に確認完了側が進行済みなら何もしない（単一進行の保証）
							const latestRaw = await this.redisClient.get(key);
							if (latestRaw == null) return true;
							const latestWaiting = parseNextKyokuWaiting(latestRaw);
							if (latestWaiting != null && !isSameNextKyokuKey(latestWaiting.expected, expected)) return true;
							// 自世代トークン。進行中のネスト中断で置き換わった新待機を消さないよう末尾削除の一致判定に使う。
							const ownToken = latestWaiting?.token;
							const fresh = await this.getRoom(roomId);
							// 空室なら進行不能のためキーを掃除する
							if (fresh == null || fresh.gameState == null) {
								await this.redisClient.del(key);
								return true;
							}
							const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
							// 進行成功後にキーを削除する（del 直後の失敗で進行もキーも失う永久停止を避ける）。
							// ネスト中断で新待機に置き換わっていたら削除しない（高速経路と同一方式）。
							await this.nextKyokuLocked(fresh, freshMj, kyokuResult, expected);
							const afterRaw = await this.redisClient.get(key);
							if (afterRaw != null) {
								const after = parseNextKyokuWaiting(afterRaw);
								if (after == null || after.token === ownToken) {
									await this.redisClient.del(key);
								}
							}
							return true;
						});
					} catch (err) {
						console.error('mahjong: failed to nextKyoku', err);
					}
					// 失敗時は interval を維持して次 tick で再試行する
					if (done) {
						clearInterval(interval);
						this.removeTimer(this.otherTimers, roomId, interval);
					}
				}
			} catch (err) {
				console.error('mahjong: failed to poll nextKyoku confirmation', err);
			}
		}, 500);
		this.addTimer(this.otherTimers, roomId, interval);
	}

	@bindThis
	private async endKyoku(room: MahjongRoom, mj: Mmj.MasterGameEngine, kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] }): Promise<void> {
		// NOTE: ロック保持中に呼ぶこと。次局への進行はタイマー発火時に roomId のみから再取得して別ロックで行う。
		this.clearTurnTimers(room.id);

		const key = `mahjong:gameNextKyokuConfirmation:${room.id}`;
		const expected: NextKyokuKey = {
			round: mj.$state.round,
			kyoku: mj.$state.kyoku,
			turnCount: mj.$state.turnCount,
		};
		// 同一局の待機が既に進行中なら二重開始しない（多重 endKyoku の抑止）
		const existingRaw = await this.redisClient.get(key);
		if (existingRaw != null) {
			const existing = parseNextKyokuWaiting(existingRaw);
			if (existing != null && isSameNextKyokuKey(existing.expected, expected)) {
				console.warn('mahjong: endKyoku already waiting for same kyoku', { roomId: room.id, expected });
				// 同一待機の抑止時も監視だけ追加する（キーの内容は書き換えない）。
				// 既存 interval と多重になっても、期待局不一致ガードと単一進行保証で多重進行は起きない（冪等）。
				this.watchNextKyokuConfirmation(room.id, existing.expected, existing.kyokuResult);
				return;
			}
		}

		const waiting: NextKyokuWaiting = {
			confirmation: {
				user1: room.user1Ai,
				user2: room.user2Ai,
				user3: room.user3Ai,
				user4: room.user4Ai,
			},
			kyokuResult,
			expected,
			token: Math.random().toString(36).slice(2),
		};
		await this.redisClient.set(key, JSON.stringify(waiting), 'EX', AUX_KEY_TTL_SECONDS);
		this.watchNextKyokuConfirmation(room.id, expected, kyokuResult);
	}

	@bindThis
	private async nextKyokuLocked(room: MahjongRoom, mj: Mmj.MasterGameEngine, kyokuResult: { agariHouse: Mmj.House | null; tenpaiHouses: Mmj.House[] }, expected: NextKyokuKey): Promise<void> {
		// NOTE: withRoomLock の内側で呼ぶこと（room/mj はロック内で再取得した fresh なもの）。
		// 冪等ガード: 既に次局へ進行済み（または対局終了済み）なら何もしない
		if (room.isEnded) {
			console.warn('mahjong: nextKyoku skipped: room already ended', { roomId: room.id });
			return;
		}
		const current: NextKyokuKey = {
			round: mj.$state.round,
			kyoku: mj.$state.kyoku,
			turnCount: mj.$state.turnCount,
		};
		if (!isSameNextKyokuKey(current, expected)) {
			console.warn('mahjong: nextKyoku skipped: key mismatch', { roomId: room.id, current, expected });
			return;
		}
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
		// 2局目以降の新局配牌も親14枚が九種九牌なら中途流局とする。
		try {
			mj.assertKyushuKyuhai();
		} catch (err) {
			if (err instanceof Mmj.AbortiveDrawError) {
				await this.abortiveDrawLocked(room, mj, err.kind);
				return;
			}
			throw err;
		}
		room.gameState = mj.getState();

		await this.saveRoom(room);
		this.globalEventService.publishMahjongRoomStream(room.id, 'nextKyoku', { room });
		this.kyokuStarted(room);
	}

	@bindThis
	private async endGame(room: MahjongRoom): Promise<void> {
		this.clearAllTimers(room.id);
		await this.redisClient.del(`mahjong:gameNextKyokuConfirmation:${room.id}`);
		room.isEnded = true;
		room.endedAt = new Date().toISOString();
		await this.saveRoom(room);
		this.globalEventService.publishMahjongRoomStream(room.id, 'ended', { room });
	}

	@bindThis
	private async dahaiLocked(room: MahjongRoom, mj: Mmj.MasterGameEngine, house: Mmj.House, tile: Mmj.TileId, riichi = false): Promise<void> {
		// NOTE: withRoomLock の内側で呼ぶこと（room/mj はロック内で再取得した fresh なもの）。
		let res: ReturnType<Mmj.MasterGameEngine['commit_dahai']>;
		try {
			res = mj.commit_dahai(house, tile, riichi);
		} catch (err) {
			if (err instanceof Mmj.AbortiveDrawError) {
				await this.clearTurnWaitingTimer(room.id);
				await this.abortiveDrawLocked(room, mj, err.kind);
				return;
			}
			throw err;
		}
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
			// 流し満貫の成就時は親連荘とするため tenpaiHouses ['e'] で既存経路に乗せる
			// (commit_nextKyoku は親テンパイ流局で連荘する)。
			await this.endKyoku(room, mj, { agariHouse: null, tenpaiHouses: ryuukyokuResult.nagashiHouses.length > 0 ? ['e'] : ryuukyokuResult.tenpaiHouses });
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

			await this.redisClient.set(`mahjong:gameCallingAsking:${room.id}`, JSON.stringify(answers), 'EX', AUX_KEY_TTL_SECONDS);
			const waitingStartedAt = Date.now();
			const askingTimeoutMs = room.timeLimitForEachTurn * 1000;
			const roomId = room.id;
			const askingCanPonHouses = [...canPonHouses];
			const askingCanKanHouses = [...canKanHouses];
			const askingCanCiiHouse = res.canCiiHouse;
			const askingCanRonHouses = [...res.canRonHouses];
			const interval = setInterval(async () => {
				const current = await this.redisClient.get(`mahjong:gameCallingAsking:${roomId}`);
				if (current == null) {
					clearInterval(interval);
					this.removeTimer(this.otherTimers, roomId, interval);
					return;
				}
				const currentAnswers = JSON.parse(current) as CallingAnswers;
				normalizeCallingAnswers(currentAnswers);
				const allAnswered = !(
					(askingCanPonHouses.some(h => currentAnswers.pon[h] == null)) ||
					(askingCanCiiHouse != null && currentAnswers.cii == null) ||
					(askingCanKanHouses.some(h => currentAnswers.kan[h] == null)) ||
					(askingCanRonHouses.includes('e') && currentAnswers.ron.e == null) ||
					(askingCanRonHouses.includes('s') && currentAnswers.ron.s == null) ||
					(askingCanRonHouses.includes('w') && currentAnswers.ron.w == null) ||
					(askingCanRonHouses.includes('n') && currentAnswers.ron.n == null)
				);
				if (allAnswered || (Date.now() - waitingStartedAt > askingTimeoutMs)) {
					clearInterval(interval);
					this.removeTimer(this.otherTimers, roomId, interval);
					await this.redisClient.del(`mahjong:gameCallingAsking:${roomId}`);
					// タイムアウト時は未回答の caller 全員を辞退扱いにする
					for (const h of askingCanPonHouses) {
						if (currentAnswers.pon[h] == null) currentAnswers.pon[h] = false;
					}
					for (const h of askingCanKanHouses) {
						if (currentAnswers.kan[h] == null) currentAnswers.kan[h] = false;
					}
					try {
						await this.withRoomLock(roomId, async () => {
							const fresh = await this.getRoom(roomId);
							if (fresh == null || fresh.gameState == null) return;
							const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
							await this.answerLocked(fresh, freshMj, currentAnswers);
						});
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
	private async tsumoHoraByHouseLocked(room: MahjongRoom, mj: Mmj.MasterGameEngine, house: Mmj.House): Promise<void> {
		// NOTE: withRoomLock の内側で呼ぶこと（room/mj はロック内で再取得した fresh なもの）。
		const res = mj.commit_tsumoHora(house);
		room.gameState = mj.getState();
		await this.clearTurnWaitingTimer(room.id);
		await this.saveRoom(room);

		this.globalEventService.publishMahjongRoomStream(room.id, 'tsumoHora', { house, handTiles: res.handTiles, tsumoTile: res.tsumoTile, uraDoraIndicateTiles: mj.uraDoraIndicateTiles });
		await this.endKyoku(room, mj, { agariHouse: house, tenpaiHouses: [] });
	}

	@bindThis
	private async waitForTurn(room: MahjongRoom, house: Mmj.House, mj: Mmj.MasterGameEngine): Promise<void> {
		// NOTE: withRoomLock の内側（または startGame/nextKyokuLocked 等のロック内経路）から呼ぶこと。
		// タイマーには room/mj のスナップショットを持ち込まず、roomId のみを捕捉して発火時にロック内で再取得する。
		const aiHouses = this.getAiHouses(room, mj);
		const roomId = room.id;

		if (aiHouses.includes(house)) {
			if (Mmj.isAgarikei(mj.handTileTypes[house])) {
				const timer = setTimeout(() => {
					this.removeTimer(this.turnTimers, roomId, timer);
					void this.withRoomLock(roomId, async () => {
						const fresh = await this.getRoom(roomId);
						if (fresh == null || fresh.gameState == null || fresh.isEnded) return;
						const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
						try {
							await this.tsumoHoraByHouseLocked(fresh, freshMj, house);
						} catch (err) {
							console.error('mahjong: AI failed to tsumoHora, discarding instead', err);
							const handTiles = freshMj.handTiles[house];
							await this.dahaiLocked(fresh, freshMj, house, handTiles.at(-1)!).catch(e => console.error('mahjong: AI failed to dahai', e));
						}
					}).catch(e => console.error('mahjong: AI failed to dahai', e));
				}, 500);
				this.addTimer(this.turnTimers, room.id, timer);
				return;
			}

			const timer = setTimeout(() => {
				this.removeTimer(this.turnTimers, roomId, timer);
				void this.withRoomLock(roomId, async () => {
					const fresh = await this.getRoom(roomId);
					if (fresh == null || fresh.gameState == null || fresh.isEnded) return;
					const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
					const handTiles = freshMj.handTiles[house];
					await this.dahaiLocked(fresh, freshMj, house, handTiles.at(-1)!);
				}).catch(err => console.error('mahjong: AI failed to dahai', err));
			}, 500);
			this.addTimer(this.turnTimers, room.id, timer);
			return;
		}

		if (mj.riichis[house]) {
			// リーチ時はアガリ牌でない限りツモ切り
			if (!Mmj.isAgarikei(mj.handTileTypes[house])) {
				const timer = setTimeout(() => {
					this.removeTimer(this.turnTimers, roomId, timer);
					void this.withRoomLock(roomId, async () => {
						const fresh = await this.getRoom(roomId);
						if (fresh == null || fresh.gameState == null || fresh.isEnded) return;
						const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
						const handTiles = freshMj.handTiles[house];
						await this.dahaiLocked(fresh, freshMj, house, handTiles.at(-1)!);
					}).catch(err => console.error('mahjong: failed to dahai after riichi', err));
				}, 500);
				this.addTimer(this.turnTimers, room.id, timer);
				return;
			}
		}

		const id = Math.random().toString(36).slice(2);
		await this.redisClient.sadd(`mahjong:gameTurnWaiting:${room.id}`, id);
		await this.redisClient.expire(`mahjong:gameTurnWaiting:${room.id}`, AUX_KEY_TTL_SECONDS);
		const waitingStartedAt = Date.now();
		const timeoutMs = room.timeLimitForEachTurn * 1000;
		const interval = setInterval(async () => {
			const waiting = await this.redisClient.sismember(`mahjong:gameTurnWaiting:${roomId}`, id);
			if (waiting === 0) {
				clearInterval(interval);
				this.removeTimer(this.turnTimers, roomId, interval);
				return;
			}
			if (Date.now() - waitingStartedAt > timeoutMs) {
				await this.redisClient.srem(`mahjong:gameTurnWaiting:${roomId}`, id);
				clearInterval(interval);
				this.removeTimer(this.turnTimers, roomId, interval);
				try {
					await this.withRoomLock(roomId, async () => {
						const fresh = await this.getRoom(roomId);
						if (fresh == null || fresh.gameState == null || fresh.isEnded) return;
						const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
						const handTiles = freshMj.handTiles[house];
						await this.dahaiLocked(fresh, freshMj, house, handTiles.at(-1)!);
					});
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
		if (room == null) {
			console.warn('mahjong: confirmNextKyoku skipped: room not found', { roomId });
			return;
		}
		if (room.gameState == null) {
			console.warn('mahjong: confirmNextKyoku skipped: no gameState', { roomId });
			return;
		}
		if (room.isEnded) {
			console.warn('mahjong: confirmNextKyoku skipped: room already ended', { roomId });
			return;
		}

		const slot = getSlotOfUserId(room, user.id);
		if (slot == null) {
			console.warn('mahjong: confirmNextKyoku skipped: user is not a member', { roomId, userId: user.id });
			return;
		}

		const key = `mahjong:gameNextKyokuConfirmation:${room.id}`;
		const confirmationRaw = await this.redisClient.get(key);
		if (confirmationRaw == null) {
			console.warn('mahjong: confirmNextKyoku skipped: no waiting key', { roomId, slot });
			return;
		}
		const confirmation = parseNextKyokuConfirmation(confirmationRaw);
		if (confirmation == null) {
			console.warn('mahjong: confirmNextKyoku skipped: unparseable waiting key', { roomId, slot });
			return;
		}
		// 同一ユーザーの連打は同じ true 代入になるため冪等
		confirmation[`user${slot}` as keyof NextKyokuConfirmation] = true;
		const mj = new Mmj.MasterGameEngine(room.gameState);
		const current: NextKyokuKey = {
			round: mj.$state.round,
			kyoku: mj.$state.kyoku,
			turnCount: mj.$state.turnCount,
		};
		let waiting = parseNextKyokuWaiting(confirmationRaw);
		if (waiting == null) {
			// 旧形式キー: 待機レコードへ移行する（再起動後に監視 interval が無くても進行できるようにする）。
			// kyokuResult はキーから復元できないため、連荘判定なしの中立値で緊急回復する（点数は和了時に確定済み）。
			waiting = {
				confirmation,
				kyokuResult: { agariHouse: null, tenpaiHouses: [] },
				expected: current,
			};
		}
		// 自世代の待機を識別するトークン。旧形式キーには無いため付与する。
		if (waiting.token == null) waiting.token = Math.random().toString(36).slice(2);
		if (!(confirmation.user1 && confirmation.user2 && confirmation.user3 && confirmation.user4)) {
			await this.redisClient.set(key, JSON.stringify({ ...waiting, confirmation }), 'EX', AUX_KEY_TTL_SECONDS);
			return;
		}
		// 別局の待機に置き換わっていたら触らない（旧世代キーの誤消費防止）
		if (!isSameNextKyokuKey(current, waiting.expected)) {
			console.warn('mahjong: confirmNextKyoku skipped: key mismatch', { roomId, current, expected: waiting.expected });
			return;
		}
		// 確認完了点を高速進行させる。フラグを先に保存してから進行する。
		// 末尾の削除は自世代トークン一致時のみ行う。nextKyokuLocked 内で中断→endKyoku が起きると
		// キーがネスト側の新待機に置き換わるため、無条件 del では新待機を消して永久停止する。
		// ポーリング側はキー消失を見て自消し、仮に発火しても期待局不一致ガードで多重進行しない。
		const ownToken = waiting.token;
		await this.redisClient.set(key, JSON.stringify({ ...waiting, confirmation }), 'EX', AUX_KEY_TTL_SECONDS);
		await this.nextKyokuLocked(room, mj, waiting.kyokuResult, waiting.expected);
		const latestRaw = await this.redisClient.get(key);
		if (latestRaw != null) {
			const latest = parseNextKyokuWaiting(latestRaw);
			if (latest != null && latest.token === ownToken) {
				await this.redisClient.del(key);
			}
		}
	}

	@bindThis
	public async commit_dahai(roomId: MahjongRoom['id'], user: MiUser, tile: Mmj.TileId, riichi = false): Promise<void> {
		return await this.withRoomLock(roomId, async () => {
			const room = await this.getRoom(roomId);
			if (room == null) return;
			if (room.gameState == null) return;
			if (room.isEnded) return;

			const mj = new Mmj.MasterGameEngine(room.gameState);
			const myHouse = getHouseOfUserId(room, mj, user.id);

			try {
				await this.dahaiLocked(room, mj, myHouse, tile, riichi);
			} catch (err) {
				console.error('mahjong: failed to dahai', err);
			}
		});
	}

	@bindThis
	public async commit_ankan(roomId: MahjongRoom['id'], user: MiUser, tile: Mmj.TileId): Promise<void> {
		return await this.withRoomLock(roomId, async () => {
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
				if (err instanceof Mmj.AbortiveDrawError) {
					await this.clearTurnWaitingTimer(room.id);
					await this.abortiveDrawLocked(room, mj, err.kind);
					return;
				}
				console.error('mahjong: failed to ankan', err);
			}
		});
	}

	@bindThis
	public async commit_kakan(roomId: MahjongRoom['id'], user: MiUser, tile: Mmj.TileId): Promise<void> {
		return await this.withRoomLock(roomId, async () => {
			const room = await this.getRoom(roomId);
			if (room == null) return;
			if (room.gameState == null) return;
			if (room.isEnded) return;

			const mj = new Mmj.MasterGameEngine(room.gameState);
			const myHouse = getHouseOfUserId(room, mj, user.id);

			try {
				let res: ReturnType<Mmj.MasterGameEngine['commit_kakan']>;
				try {
					res = mj.commit_kakan(myHouse, tile);
				} catch (err) {
					if (err instanceof Mmj.AbortiveDrawError) {
						await this.clearTurnWaitingTimer(room.id);
						await this.abortiveDrawLocked(room, mj, err.kind);
						return;
					}
					throw err;
				}
				room.gameState = mj.getState();
				await this.clearTurnWaitingTimer(room.id);
				await this.saveRoom(room);
				if ('asking' in res && res.asking) {
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

				const aiHouses = this.getAiHouses(room, mj);
				for (const h of res.canRonHouses) {
					if (aiHouses.includes(h)) {
						answers.ron[h] = true;
					}
				}

				await this.redisClient.set(`mahjong:gameCallingAsking:${room.id}`, JSON.stringify(answers), 'EX', AUX_KEY_TTL_SECONDS);
				const waitingStartedAt = Date.now();
				const kakanAskingTimeoutMs = room.timeLimitForEachTurn * 1000;
				const roomIdForAsking = room.id;
				const canRonHouses = [...res.canRonHouses];
				const interval = setInterval(async () => {
					const current = await this.redisClient.get(`mahjong:gameCallingAsking:${roomIdForAsking}`);
					if (current == null) {
						clearInterval(interval);
						this.removeTimer(this.otherTimers, roomIdForAsking, interval);
						return;
					}
					const currentAnswers = JSON.parse(current) as CallingAnswers;
					normalizeCallingAnswers(currentAnswers);
					const allAnswered = !(canRonHouses.some(h => currentAnswers.ron[h] == null));
					if (allAnswered || (Date.now() - waitingStartedAt > kakanAskingTimeoutMs)) {
						clearInterval(interval);
						this.removeTimer(this.otherTimers, roomIdForAsking, interval);
						await this.redisClient.del(`mahjong:gameCallingAsking:${roomIdForAsking}`);
						for (const h of canRonHouses) {
							if (currentAnswers.ron[h] == null) currentAnswers.ron[h] = false;
						}
						try {
							await this.withRoomLock(roomIdForAsking, async () => {
								const fresh = await this.getRoom(roomIdForAsking);
								if (fresh == null || fresh.gameState == null) return;
								const freshMj = new Mmj.MasterGameEngine(fresh.gameState);
								await this.answerLocked(fresh, freshMj, currentAnswers);
							});
						} catch (err) {
							console.error('mahjong: failed to resolve kakan asking', err);
						}
					}
				}, 500);
				this.addTimer(this.otherTimers, room.id, interval);

				this.globalEventService.publishMahjongRoomStream(room.id, 'kakanDeclared', { house: myHouse, tiles: res.tiles as unknown as readonly [number, number, number, number], from: res.from, doraIndicateTiles: mj.doraIndicateTiles });
				return;
			}
			const completed = res as { rinsyan: number; tiles: readonly [number, number, number, number]; from: Mmj.House };
			this.globalEventService.publishMahjongRoomStream(room.id, 'kakanned', { house: myHouse, tiles: completed.tiles, rinsyan: completed.rinsyan, from: completed.from, doraIndicateTiles: mj.doraIndicateTiles });
			this.waitForTurn(room, myHouse, mj);
			} catch (err) {
				console.error('mahjong: failed to kakan', err);
			}
		});
	}

	@bindThis
	public async commit_tsumoHora(roomId: MahjongRoom['id'], user: MiUser): Promise<void> {
		return await this.withRoomLock(roomId, async () => {
			const room = await this.getRoom(roomId);
			if (room == null) return;
			if (room.gameState == null) return;
			if (room.isEnded) return;

			const mj = new Mmj.MasterGameEngine(room.gameState);
			const myHouse = getHouseOfUserId(room, mj, user.id);

			try {
				await this.tsumoHoraByHouseLocked(room, mj, myHouse);
			} catch (err) {
				console.error('mahjong: failed to tsumoHora', err);
			}
		});
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
		await this.redisClient.set(`mahjong:gameCallingAsking:${room.id}`, JSON.stringify(currentAnswers), 'EX', AUX_KEY_TTL_SECONDS);
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
