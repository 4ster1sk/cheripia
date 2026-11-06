import { describe, test, beforeAll, vi } from 'vitest';
import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import * as Misskey from 'misskey-js';
import { assertNotificationReceived, createAccount, type LoginUser, resolveRemoteNote, resolveRemoteUser, sleep, WAIT_FOR_FEDERATION } from './utils.js';

describe('Block', () => {
	async function waitForBlocked(blocked: LoginUser, blockerId: string): Promise<void> {
		await vi.waitFor(async () => {
			const blocker = await blocked.client.request('users/show', { userId: blockerId });
			strictEqual(blocker.isBlocked, true);
		}, WAIT_FOR_FEDERATION);
	}

	// ブロック解除は Undo(Block) アクティビティとして対向インスタンスへ配送されるが、
	// 処理されるまで対向側のローカルなブロック関係は残る。その間は対向の ap/show も
	// ブロック済み著者のノートを NO_SUCH_OBJECT で除外するため、解除の反映を待つ。
	async function waitForUnblocked(unblocked: LoginUser, blockerId: string): Promise<void> {
		await vi.waitFor(async () => {
			const blocker = await unblocked.client.request('users/show', { userId: blockerId });
			strictEqual(blocker.isBlocked, false);
		}, WAIT_FOR_FEDERATION);
	}

	// ReactionService のブロック判定は RedisKVCache (userBlocking) を見るが、
	// Redis 側の更新は Undo(Block) 処理プロセスにしか届かず、他のワーカーは
	// プロセス内メモリキャッシュ (TTL 60秒, misc/cache.ts の TODO 参照) が
	// 切れるまで旧ブロックで拒否し続ける。TTL に対する余裕を持った待ち受けにする。
	const WAIT_FOR_USER_BLOCKING_CACHE = { timeout: 90_000, interval: 2000 };

	describe('Check follow', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot follow if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await waitForBlocked(bob, aliceInB.id);
			await rejects(
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				(err: any) => {
					strictEqual(err.code, 'BLOCKED');
					return true;
				},
			);

			const following = await bob.client.request('users/following', { userId: bob.id });
			strictEqual(following.length, 0);
			const followers = await alice.client.request('users/followers', { userId: alice.id });
			strictEqual(followers.length, 0);
		});

		// FIXME: this is invalid case
		test('Cannot follow even if unblocked', async () => {
			// unblock here
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			// TODO: why still being blocked?
			await rejects(
				async () => await bob.client.request('following/create', { userId: aliceInB.id }),
				(err: any) => {
					strictEqual(err.code, 'BLOCKED');
					return true;
				},
			);
		});

		test.skip('Can follow if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await sleep();

			await bob.client.request('following/create', { userId: aliceInB.id });
			await sleep();

			const following = await bob.client.request('users/following', { userId: bob.id });
			strictEqual(following.length, 1);
			const followers = await alice.client.request('users/followers', { userId: alice.id });
			strictEqual(followers.length, 1);
		});

		test.skip('Remove follower when block them', async () => {
			test('before block', async () => {
				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 1);
				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 1);
			});

			await alice.client.request('blocking/create', { userId: bobInA.id });
			await sleep();

			test('after block', async () => {
				const following = await bob.client.request('users/following', { userId: bob.id });
				strictEqual(following.length, 0);
				const followers = await alice.client.request('users/followers', { userId: alice.id });
				strictEqual(followers.length, 0);
			});
		});
	});

	describe('Check reply', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot reply if blocked', async () => {
			// ブロック後の ap/show はブロック済み著者のノートを返さない (NO_SUCH_OBJECT) ため、
			// リプライ対象のノートはブロック前に解決しておき、notes/create のブロック判定を検証する
			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);

			await alice.client.request('blocking/create', { userId: bobInA.id });
			await waitForBlocked(bob, aliceInB.id);

			await rejects(
				async () => await bob.client.request('notes/create', { text: 'b', replyId: resolvedNote.id }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		test('Can reply if unblocked', async () => {
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			// b.test 側のブロック関係が解除される (Undo(Block) 処理) まで解決が拒否されるため待つ
			await waitForUnblocked(bob, aliceInB.id);

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			const reply = (await bob.client.request('notes/create', { text: 'b', replyId: resolvedNote.id })).createdNote;

			await resolveRemoteNote('b.test', reply.id, alice);
		});
	});

	describe('Check reaction', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		test('Cannot reaction if blocked', async () => {
			// リプライテストと同様、ブロック後はノートを解決できないためブロック前に解決しておく
			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);

			await alice.client.request('blocking/create', { userId: bobInA.id });
			await waitForBlocked(bob, aliceInB.id);

			await rejects(
				async () => await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
		});

		test('Can reaction if unblocked', async () => {
			// Undo(Block) が b.test で処理され、ブロック関係が無効化されてから
			// 解決・リアクションが成功するのを待つ (反映前の旧ブロックでは ap/show が拒否する)
			await alice.client.request('blocking/delete', { userId: bobInA.id });
			await waitForUnblocked(bob, aliceInB.id);

			const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);

			// ReactionService のブロック判定は RedisKVCache (userBlocking) を見るが、
			// Undo(Block) による Redis 更新は処理ワーカーのメモリキャッシュしか更新せず、
			// 他ワーカーはプロセス内キャッシュ (TTL 60秒) が切れるまで旧ブロックで拒否する
			// (misc/cache.ts の TODO の既知挙動)。TTL に対する余裕を持ってリトライする。
			await vi.waitFor(async () => {
				try {
					await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' });
				} catch (err: any) {
					if (err.code !== 'ALREADY_REACTED') throw err;
				}
			}, WAIT_FOR_USER_BLOCKING_CACHE);

			// リアクションが a.test へ反映されるまで待つ
			await vi.waitFor(async () => {
				const _note = await alice.client.request('notes/show', { noteId: note.id });
				deepStrictEqual(_note.reactions, { '😅': 1 });
			}, WAIT_FOR_FEDERATION);
		}, 150_000);
	});

	describe('Check mention', () => {
		let alice: LoginUser, bob: LoginUser;
		let bobInA: Misskey.entities.UserDetailedNotMe, aliceInB: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);

			[bobInA, aliceInB] = await Promise.all([
				resolveRemoteUser('b.test', bob.id, alice),
				resolveRemoteUser('a.test', alice.id, bob),
			]);
		});

		/** NOTE: You should mute the target to stop receiving notifications */
		test('Can mention and notified even if blocked', async () => {
			await alice.client.request('blocking/create', { userId: bobInA.id });
			await waitForBlocked(bob, aliceInB.id);

			const text = `@${alice.username}@a.test plz unblock me!`;
			await assertNotificationReceived(
				'a.test', alice,
				async () => await bob.client.request('notes/create', { text }),
				notification => notification.type === 'mention' && notification.userId === bobInA.id && notification.note.text === text,
				true,
			);
		});
	});
});
