/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { DataSource } from 'typeorm';
import { loadConfig } from '@/config.js';
import { MiUserKeypair } from '@/models/_.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiFollowing } from '@/models/Following.js';
import { MiInstance } from '@/models/Instance.js';
import { MiNote } from '@/models/Note.js';
import { MiUser } from '@/models/User.js';
import { MiUserPublickey } from '@/models/UserPublickey.js';
import { api, initTestDb, post, randomString, relativeFetch, signup } from '../utils.js';
import type * as misskey from 'misskey-js';

const config = loadConfig();

async function fetchUserKeypair(db: DataSource, userId: string): Promise<MiUserKeypair> {
	const keypair = await db.getRepository(MiUserKeypair).findOneBy({ userId });
	assert.ok(keypair, 'keypair not found');
	return keypair;
}

async function signedApGet(
	path: string,
	keypair: { privateKey: string },
	userId: string,
	hostHeader?: string,
) {
	const date = new Date().toUTCString();
	const host = hostHeader ?? config.host;
	const signingString = [
		`(request-target): get ${path}`,
		`date: ${date}`,
		`host: ${host}`,
	].join('\n');
	const signature = crypto.createSign('RSA-SHA256').update(signingString).sign(keypair.privateKey, 'base64');
	const signatureHeader = `keyId="${config.url}/users/${userId}/publickey",algorithm="rsa-sha256",headers="(request-target) date host",signature="${signature}"`;

	return await relativeFetch(path, {
		headers: {
			Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
			Date: date,
			Signature: signatureHeader,
			Host: host,
		},
		redirect: 'manual',
	});
}

const DEFAULT_REMOTE_HOST = 'signed-get.test';

async function setInstanceQuarantine(db: DataSource, host: string, limited: boolean): Promise<void> {
	const instances = db.getRepository(MiInstance);
	const existing = await instances.findOneBy({ host });
	if (existing == null) {
		await instances.insert({
			id: randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10),
			host,
			firstRetrievedAt: new Date(),
			quarantineLimited: limited,
		});
	} else {
		await instances.update({ host }, { quarantineLimited: limited });
	}
}

async function createRemoteUser(
	db: DataSource,
	opts: { host?: string; suspended?: boolean; invalidKeyPem?: boolean; quarantined?: boolean } = {},
): Promise<{ id: string; privateKey: string }> {
	const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	const id = randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10);
	const host = opts.host ?? DEFAULT_REMOTE_HOST;
	await db.getRepository(MiUser).insert({
		id,
		username: id,
		usernameLower: id,
		host,
		uri: `https://${host}/users/${id}`,
		inbox: `https://${host}/users/${id}/inbox`,
		isSuspended: opts.suspended ?? false,
	});
	await db.getRepository(MiUserPublickey).insert({
		userId: id,
		keyId: `${config.url}/users/${id}/publickey`,
		keyPem: opts.invalidKeyPem ? 'this-is-not-a-valid-public-key' : publicKey,
	});
	if (opts.quarantined) {
		await setInstanceQuarantine(db, host, true);
	}
	return { id, privateKey };
}

async function insertFollowing(db: DataSource, followerId: string, followeeId: string, followerHost?: string): Promise<void> {
	await db.getRepository(MiFollowing).insert({
		id: randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10),
		followerId,
		followeeId,
		followerHost: followerHost ?? DEFAULT_REMOTE_HOST,
	});
}

describe('ActivityPub note endpoint', () => {
	let db: DataSource;
	let author: misskey.entities.SignupResponse;
	let follower: misskey.entities.SignupResponse;
	let followerKeypair: MiUserKeypair;

	beforeAll(async () => {
		db = await initTestDb(true);
		// author must be the first user so it becomes the root/admin user.
		author = await signup();
		follower = await signup();
		const metaRes = await api('admin/update-meta', { federation: 'all' }, author);
		assert.strictEqual(metaRes.status, 204);
		followerKeypair = await fetchUserKeypair(db, follower.id);
		// ローカルユーザーに user_publickey 行を登録し、getAuthUserFromKeyId が authUser を
		// 解決できる状態にする。これがないと unknown keyId で却下され、
		// authenticate() の host == null (ローカルユーザーの署名拒否) 分岐を通らない。
		// host == null チェックを外せばこの 2 テストは 200 で落ちるはず。
		await db.getRepository(MiUserPublickey).insert({
			userId: follower.id,
			keyId: `${config.url}/users/${follower.id}/publickey`,
			keyPem: followerKeypair.publicKey,
		});
		await api('following/create', { userId: author.id }, follower);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await db.destroy();
	});

	test('public note has public Cache-Control', async () => {
		const note = await post(author, { text: 'public', visibility: 'public' });
		const res = await relativeFetch(`/notes/${note.id}`, {
			headers: { Accept: 'application/activity+json' },
			redirect: 'manual',
		});
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=180');
	});

	test('home note has public Cache-Control', async () => {
		const note = await post(author, { text: 'home', visibility: 'home' });
		const res = await relativeFetch(`/notes/${note.id}`, {
			headers: { Accept: 'application/activity+json' },
			redirect: 'manual',
		});
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=180');
	});

	test('followers-only note without auth returns 403', async () => {
		const note = await post(author, { text: 'followers', visibility: 'followers' });
		const res = await relativeFetch(`/notes/${note.id}`, {
			headers: { Accept: 'application/activity+json' },
			redirect: 'manual',
		});
		assert.strictEqual(res.status, 403);
	});

	test('specified note without auth returns 403', async () => {
		const note = await post(author, { text: 'specified', visibility: 'specified', visibleUserIds: [follower.id] });
		const res = await relativeFetch(`/notes/${note.id}`, {
			headers: { Accept: 'application/activity+json' },
			redirect: 'manual',
		});
		assert.strictEqual(res.status, 403);
	});

	test('followers-only note with local-user signed get is rejected', async () => {
		const note = await post(author, { text: 'followers signed', visibility: 'followers' });
		// follower は作者のフォロワーだが、user_publickey 登録済みなので host == null 却下分岐で 403
		const res = await signedApGet(`/notes/${note.id}`, followerKeypair, follower.id);
		assert.strictEqual(res.status, 403);
	});

	test('followers-only note with mismatched Host header returns 403', async () => {
		// 署名者は閲覧権限を持つリモートユーザーにする。ローカルユーザー (host == null) を
		// 署名者にすると、Host チェックを外しても host == null 却下で 403 になるため、
		// Host 検証の欠落を検出できない。
		const remote = await createRemoteUser(db);
		await insertFollowing(db, remote.id, author.id);
		const note = await post(author, { text: `followers host ${Date.now()}`, visibility: 'followers' });
		const baseline = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
		assert.strictEqual(baseline.status, 200);
		const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id, 'evil.test');
		assert.strictEqual(res.status, 403);
	});

	test('specified note with local-user signed get by visible user is rejected', async () => {
		const note = await post(author, { text: 'specified', visibility: 'specified', visibleUserIds: [follower.id] });
		// follower は visibleUser だが、user_publickey 登録済みなので host == null 却下分岐で 403
		const res = await signedApGet(`/notes/${note.id}`, followerKeypair, follower.id);
		assert.strictEqual(res.status, 403);
	});

	test('specified note with signed get by non-visible user returns 403', async () => {
		// 有効なリモート署名を使って visibleUserIds 判定そのものを検証する。
		// ローカルユーザーの署名だと authenticate() の host == null で却下され、権限判定に到達しない。
		const remote = await createRemoteUser(db);
		const note = await post(author, { text: `specified hidden ${Date.now()}`, visibility: 'specified', visibleUserIds: [follower.id] });
		const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
		assert.strictEqual(res.status, 403);
	});

	describe('Signed Get by remote users', () => {
		test('followers-only note with remote follower signed get returns 200', async () => {
			const remote = await createRemoteUser(db);
			await insertFollowing(db, remote.id, author.id);
			const note = await post(author, { text: `followers remote ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
		});

		test('specified note with remote visible user signed get returns 200', async () => {
			const remote = await createRemoteUser(db);
			const note = await post(author, { text: `specified remote ${Date.now()}`, visibility: 'specified', visibleUserIds: [remote.id] });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
		});

		test('suspended remote user is rejected even when in visibleUserIds', async () => {
			const remote = await createRemoteUser(db, { suspended: true });
			const note = await post(author, { text: `specified suspended ${Date.now()}`, visibility: 'specified', visibleUserIds: [remote.id] });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('invalid public key stored in DB returns 403 (not 500)', async () => {
			const remote = await createRemoteUser(db, { invalidKeyPem: true });
			await insertFollowing(db, remote.id, author.id);
			const note = await post(author, { text: `followers badkey ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('mentioned remote user without follow can fetch followers-only note', async () => {
			const remote = await createRemoteUser(db);
			const note = await post(author, { text: `followers mention ${Date.now()}`, visibility: 'followers' });
			// isVisibleForMe と同じ扱いの検証のため API を使わず mentions を直接設定
			await db.getRepository(MiNote).update({ id: note.id }, { mentions: [remote.id] });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 200);
		});

		test('replied-to remote user without follow can fetch followers-only note', async () => {
			const remote = await createRemoteUser(db);
			const note = await post(author, { text: `followers reply ${Date.now()}`, visibility: 'followers' });
			// isVisibleForMe と同じ扱いの検証のため API を使わず replyUserId を直接設定
			await db.getRepository(MiNote).update({ id: note.id }, { replyUserId: remote.id });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 200);
		});

		test('followers-only note with remote non-follower signed get returns 403', async () => {
			// follow しておらず mention / reply でもなければ、認証済みでも取得できない
			const remote = await createRemoteUser(db);
			const note = await post(author, { text: `followers non follower ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});
	});

	describe('Signed Get on /notes/:id/activity', () => {
		// /notes/:id/activity にも note ルートと同じ認証・Cache-Control 分岐が実装されていることの回帰防止
		test('anonymous GET on followers-only note activity returns 403', async () => {
			const note = await post(author, { text: 'activity followers anon', visibility: 'followers' });
			const res = await relativeFetch(`/notes/${note.id}/activity`, {
				headers: { Accept: 'application/activity+json' },
				redirect: 'manual',
			});
			assert.strictEqual(res.status, 403);
		});

		test('anonymous GET on specified note activity returns 403', async () => {
			const note = await post(author, { text: 'activity specified anon', visibility: 'specified', visibleUserIds: [follower.id] });
			const res = await relativeFetch(`/notes/${note.id}/activity`, {
				headers: { Accept: 'application/activity+json' },
				redirect: 'manual',
			});
			assert.strictEqual(res.status, 403);
		});

		test('remote follower signed GET on note activity returns 200', async () => {
			const remote = await createRemoteUser(db);
			await insertFollowing(db, remote.id, author.id);
			const note = await post(author, { text: `activity signed ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}/activity`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
			const body = await res.json() as { type?: string };
			assert.strictEqual(body.type, 'Create');
		});
	});

	describe('Signed Get with block relations', () => {
		// ブロック関係そのものはリモート→リモートでは当インスタンスのDBに存在しないため、
		// origin 側の isAuthorizedForSignedNoteGet のブロック判定を決定的に検証する。
		// (federation のブロック後は unfollow 伝搬でも同じ結果になるため、この分岐単体では落ちない)
		test('remote follower who blocked the author is rejected', async () => {
			const remote = await createRemoteUser(db);
			await insertFollowing(db, remote.id, author.id);
			await db.getRepository(MiBlocking).insert({
				id: randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10),
				blockerId: remote.id,
				blockeeId: author.id,
			});
			const note = await post(author, { text: `followers blocked by follower ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('remote user blocked by the author is rejected', async () => {
			const remote = await createRemoteUser(db);
			await insertFollowing(db, remote.id, author.id);
			await db.getRepository(MiBlocking).insert({
				id: randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10),
				blockerId: author.id,
				blockeeId: remote.id,
			});
			const note = await post(author, { text: `followers blocked by author ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('specified note is not unlocked for a remote user blocked by the author', async () => {
			const remote = await createRemoteUser(db);
			await db.getRepository(MiBlocking).insert({
				id: randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10),
				blockerId: author.id,
				blockeeId: remote.id,
			});
			const note = await post(author, { text: `specified blocked ${Date.now()}`, visibility: 'specified', visibleUserIds: [remote.id] });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});
	});

	describe('Signed Get from quarantined instance', () => {
		// 隔離 (to/cc に Public を含む public/home のみ配信) は DeliverProcessorService の
		// push 側だけで効いていたため、Signed Get という pull 経路から followers/specified が
		// 読めていた回帰防止。home は push/pull とも公開扱い (QueueService.isPublicContent と整合)。
		const QUARANTINED_HOST = 'quarantine.test';
		const UNQUARANTINED_HOST = 'unquarantine.test';

		test('followers-only note from a quarantined host returns 403', async () => {
			const remote = await createRemoteUser(db, { host: QUARANTINED_HOST, quarantined: true });
			await insertFollowing(db, remote.id, author.id, QUARANTINED_HOST);
			const note = await post(author, { text: `followers quarantined ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('specified note from a quarantined host returns 403 even for a visible user', async () => {
			const remote = await createRemoteUser(db, { host: QUARANTINED_HOST, quarantined: true });
			const note = await post(author, { text: `specified quarantined ${Date.now()}`, visibility: 'specified', visibleUserIds: [remote.id] });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('note activity from a quarantined host returns 403', async () => {
			const remote = await createRemoteUser(db, { host: QUARANTINED_HOST, quarantined: true });
			await insertFollowing(db, remote.id, author.id, QUARANTINED_HOST);
			const note = await post(author, { text: `activity quarantined ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}/activity`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('public and home notes are still served to a quarantined host', async () => {
			const remote = await createRemoteUser(db, { host: QUARANTINED_HOST, quarantined: true });
			const publicNote = await post(author, { text: `public quarantined ${Date.now()}`, visibility: 'public' });
			const publicRes = await signedApGet(`/notes/${publicNote.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(publicRes.status, 200);
			assert.strictEqual(publicRes.headers.get('cache-control'), 'public, max-age=180');

			const homeNote = await post(author, { text: `home quarantined ${Date.now()}`, visibility: 'home' });
			const homeRes = await signedApGet(`/notes/${homeNote.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(homeRes.status, 200);
			assert.strictEqual(homeRes.headers.get('cache-control'), 'public, max-age=180');
		});

		test('lifting the quarantine restores access', async () => {
			// 判定が instance テーブルを直接見ている (キャッシュを持たない) こともここで固定する
			const remote = await createRemoteUser(db, { host: UNQUARANTINED_HOST, quarantined: true });
			await insertFollowing(db, remote.id, author.id, UNQUARANTINED_HOST);
			const note = await post(author, { text: `followers unquarantined ${Date.now()}`, visibility: 'followers' });

			const blockedRes = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(blockedRes.status, 403);

			await setInstanceQuarantine(db, UNQUARANTINED_HOST, false);

			const allowedRes = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(allowedRes.status, 200);
			assert.strictEqual(allowedRes.headers.get('cache-control'), 'private, no-store');
		});
	});

	describe('Signed Get from instance-level suspended instance', () => {
		const SUSPENDED_INSTANCE_HOST = 'instance-suspended.test';

		// suspensionState (autoSuspendedForNotResponding / goneSuspended を含む) は疎通不能・
		// 運用終了を示す可用性フラグであり、閲覧権限の剥奪ではない (仕様)。
		// 遮断したい場合は blockedHosts / quarantine を使う (両方とも Signed Get 経路に適用済み)。
		// isAuthorizedForSignedNoteGet に suspensionState 判定をうっかり追加しないための
		// 逆方向のピン留めテスト。
		test('signed get from an instance-suspended host still returns 200 by design', async () => {
			const remote = await createRemoteUser(db, { host: SUSPENDED_INSTANCE_HOST });
			await insertFollowing(db, remote.id, author.id, SUSPENDED_INSTANCE_HOST);
			await db.getRepository(MiInstance).insert({
				id: randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10),
				host: SUSPENDED_INSTANCE_HOST,
				firstRetrievedAt: new Date(),
				suspensionState: 'manuallySuspended',
			});

			const note = await post(author, { text: `suspended instance ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
		});
	});

	describe('Signed Get redirecting to remote non-public notes', () => {
		const REMOTE_ORIGIN_HOST = 'private-origin.test';

		// remote 投稿の複製 (/notes/:id がリモートノートに解決されるケース) への
		// Signed Get。認証が通ると 302 で origin へ導くが、Location に
		// プライベートな origin URI が現れるため、その 302 は公開キャッシュに
		// 載せない (レビュー #5 対応の挙動を固定するテスト)。
		test('authorized signed get to a remote followers note returns 302 with private, no-store', async () => {
			const originUser = await createRemoteUser(db, { host: REMOTE_ORIGIN_HOST });
			const requester = await createRemoteUser(db);
			await insertFollowing(db, requester.id, originUser.id, DEFAULT_REMOTE_HOST);

			const noteUri = `https://${REMOTE_ORIGIN_HOST}/notes/${randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10)}`;
			const noteId = randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10);
			await db.getRepository(MiNote).insert({
				id: noteId,
				userId: originUser.id,
				userHost: REMOTE_ORIGIN_HOST,
				uri: noteUri,
				text: 'remote private note',
				visibility: 'followers',
			});

			const res = await signedApGet(`/notes/${noteId}`, { privateKey: requester.privateKey }, requester.id);
			assert.strictEqual(res.status, 302);
			assert.strictEqual(res.headers.get('location'), noteUri);
			assert.strictEqual(res.headers.get('cache-control'), 'private, no-store');
		});

		test('public remote note redirect keeps no private cache marker', async () => {
			const originUser = await createRemoteUser(db, { host: REMOTE_ORIGIN_HOST });
			const requester = await createRemoteUser(db);

			const noteUri = `https://${REMOTE_ORIGIN_HOST}/notes/${randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10)}`;
			const noteId = randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10);
			await db.getRepository(MiNote).insert({
				id: noteId,
				userId: originUser.id,
				userHost: REMOTE_ORIGIN_HOST,
				uri: noteUri,
				text: 'remote public note',
				visibility: 'public',
			});

			const res = await signedApGet(`/notes/${noteId}`, { privateKey: requester.privateKey }, requester.id);
			assert.strictEqual(res.status, 302);
			assert.strictEqual(res.headers.get('cache-control'), null);
		});
	});

	describe('Signed Get with invalid signatures', () => {
		test('signature made with a different private key is rejected (not 500)', async () => {
			const remote = await createRemoteUser(db);
			await insertFollowing(db, remote.id, author.id);
			const attacker = await createRemoteUser(db);
			const note = await post(author, { text: `wrong key ${Date.now()}`, visibility: 'followers' });
			// keyId は remote のまま、remote とは別の秘密鍵で署名する
			const res = await signedApGet(`/notes/${note.id}`, { privateKey: attacker.privateKey }, remote.id);
			assert.strictEqual(res.status, 403);
		});

		test('unknown keyId is rejected', async () => {
			const ghostId = randomString('abcdefghijklmnopqrstuvwxyz0123456789', 10);
			const note = await post(author, { text: `ghost key ${Date.now()}`, visibility: 'followers' });
			const res = await signedApGet(`/notes/${note.id}`, followerKeypair, ghostId);
			assert.strictEqual(res.status, 403);
		});
	});

	test('public note is served regardless of the signer being suspended', async () => {
		// authenticate() の凍結拒否は followers/specified の認証が必要な投稿にのみ作用し、
		// public 投稿の匿名配信を妨げないことの固定化
		const remote = await createRemoteUser(db, { suspended: true });
		const note = await post(author, { text: `public sanity ${Date.now()}`, visibility: 'public' });
		const res = await signedApGet(`/notes/${note.id}`, { privateKey: remote.privateKey }, remote.id);
		assert.strictEqual(res.status, 200);
		assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=180');
	});
});
