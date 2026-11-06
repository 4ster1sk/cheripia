import { beforeAll, describe, test } from 'vitest';
import assert, { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import * as Misskey from 'misskey-js';
import { createAccount, fetchAdmin, type LoginUser, resolveRemoteNote, resolveRemoteUser, sleep, waitForFollowRelation, waitForFollowers, waitForFollowing } from './utils.js';

describe('quarantine instance', () => {
	let alice: LoginUser, bob: LoginUser, carol:LoginUser;
	let aliceInBobHost: Misskey.entities.UserDetailedNotMe, bobInAliceHost: Misskey.entities.UserDetailedNotMe, carolInBobHost: Misskey.entities.UserDetailedNotMe;
	let aAdmin: LoginUser;
	// 隔離中 (isQuarantineLimit true) に carol@a.test が作ったフォロワー限定・指名ノート。
	// 隔離中は配信されずフェッチも拒否されるので、解除後にフェッチできる確認に使い回す。
	// テスト順序に依存せず解除後のテストから参照できるよう beforeAll で作成する。
	// (alice は同 describe の 'block' テストで bob をブロックするため、こちらでは使わない)
	let carolFollowersNoteDuringQuarantine: Misskey.entities.Note, carolSpecifiedNoteDuringQuarantine: Misskey.entities.Note;

	beforeAll(async () => {
		[alice, bob, carol] = await Promise.all([
			createAccount('a.test'),
			createAccount('b.test'),
			createAccount('a.test'),
		]);

		[aliceInBobHost, bobInAliceHost, carolInBobHost] = await Promise.all([
			resolveRemoteUser('a.test', alice.id, bob),
			resolveRemoteUser('b.test', bob.id, alice),
			resolveRemoteUser('a.test', carol.id, bob),
		]);
		await bob.client.request('following/create', { userId: aliceInBobHost.id });
		await bob.client.request('following/create', { userId: carolInBobHost.id });
		aAdmin = await fetchAdmin('a.test');
		await Promise.all([
			waitForFollowing(bob, 2),
			waitForFollowers(alice, 1),
			waitForFollowers(carol, 1),
		]);
		await sleep();
	});
	describe('isQuarantineLimit true', () => {
		let alicePublicNote: Misskey.entities.Note, alicePublicRenote: Misskey.entities.Note;
		let dave: LoginUser, davePublicNoteDuringQuarantine: Misskey.entities.Note;
		const expected :{ text: string | null, createdAt: string }[] = [];
		beforeAll(async () => {
			await aAdmin.client.request('admin/federation/update-instance', { host: 'b.test', isQuarantineLimit: true });
			await sleep();
			strictEqual((await aAdmin.client.request('federation/show-instance', { host: 'b.test' }))?.isQuarantineLimited, true);
			alicePublicNote = (await alice.client.request('notes/create', { text: 'I am Alice!' })).createdNote;
			alicePublicRenote = (await alice.client.request('notes/create', { renoteId: alicePublicNote.id })).createdNote;
			expected.push({
				text: alicePublicNote.text,
				createdAt: alicePublicNote.createdAt,
			});
			expected.push({
				text: alicePublicRenote.text,
				createdAt: alicePublicRenote.createdAt,
			});
			// Signed Get (pull) 検証用のノートをここで作成しておく。
			// テスト本文内で作成するとテスト順序の変化や失敗時に後続 describe の参照が undefined になる。
			carolFollowersNoteDuringQuarantine = (await carol.client.request('notes/create', {
				text: `followers note for pull ${Date.now()}`,
				visibility: 'followers',
			})).createdNote;
			carolSpecifiedNoteDuringQuarantine = (await carol.client.request('notes/create', {
				text: `specified note for pull ${Date.now()}`,
				visibility: 'specified',
				visibleUserIds: [bobInAliceHost.id],
			})).createdNote;
			// bob がフォローしていない dave@a.test の public ノート。
			// push されないので ap/show は必ず origin への pull になる (隔離中でも public は通る対照)。
			dave = await createAccount('a.test');
			davePublicNoteDuringQuarantine = (await dave.client.request('notes/create', {
				text: `public note for pull ${Date.now()}`,
				visibility: 'public',
			})).createdNote;
		});
		test('public', async () => {
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('home', async () => {
			const aliceHomeNote: Misskey.entities.Note = (await alice.client.request('notes/create', { text: 'home note', visibility: 'home' })).createdNote;
			const aliceHomeRenote: Misskey.entities.Note = (await alice.client.request('notes/create', { renoteId: alicePublicNote.id, visibility: 'home' })).createdNote;
			expected.push({
				text: aliceHomeNote.text,
				createdAt: aliceHomeNote.createdAt,
			});
			expected.push({
				text: aliceHomeRenote.text,
				createdAt: aliceHomeRenote.createdAt,
			});
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('home(has mention)', async () => {
			const aliceHomeNote: Misskey.entities.Note = (await alice.client.request('notes/create', { text: `@${bob.username}@b.test home note`, visibility: 'home' })).createdNote;
			expected.push({
				text: aliceHomeNote.text,
				createdAt: aliceHomeNote.createdAt,
			});
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('followers', async () => {
			await alice.client.request('notes/create', { text: 'followers note', visibility: 'followers' });
			await alice.client.request('notes/create', { renoteId: alicePublicNote.id, visibility: 'followers' });
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('specified', async () => {
			await alice.client.request('notes/create', { text: 'specified note', visibility: 'specified', visibleUserIds: [bobInAliceHost.id] });
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: aliceInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('followers-only note cannot be fetched from quarantined instance', async () => {
			// Follow / Accept は隔離でも配信されるため bob -> carol のフォロー関係は残っている。
			// それでも pull (Signed Get) では隔離ホストからの followers 照会を拒否することを確認する。
			await rejects(
				async () => await bob.client.request('ap/show', { uri: `https://a.test/notes/${carolFollowersNoteDuringQuarantine.id}` }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);
		});

		test('specified note cannot be fetched from quarantined instance even for a visible user', async () => {
			// bob は visibleUserIds に入っているが、隔離ホストのユーザーなので pull では拒否される。
			await rejects(
				async () => await bob.client.request('ap/show', { uri: `https://a.test/notes/${carolSpecifiedNoteDuringQuarantine.id}` }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);
		});

		test('public note is still fetchable from quarantined instance', async () => {
			// 拒否の誤検知でないことの対照として、public ノートの pull は隔離中でも成功することを確認する。
			// dave は bob にフォローされていないためこのノートは push されておらず、必ず origin への pull になる。
			const resolved = await resolveRemoteNote('a.test', davePublicNoteDuringQuarantine.id, bob);
			strictEqual(resolved.text, davePublicNoteDuringQuarantine.text);
		});

		test('block', async () => {
			await alice.client.request('blocking/create', { userId: bobInAliceHost.id });
			await sleep();
			const resolvedNote = await resolveRemoteNote('a.test', alicePublicNote.id, bob);
			//ブロックの配送が来ないのでb.testではブロックされていないように見える
			await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' });
			//実際にはブロックしているのでリアクションが追加されない
			const note = await alice.client.request('notes/show', { noteId: alicePublicNote.id });
			strictEqual(Object.values(note.reactions).length, 0);
		});
	});
	describe('isQuarantineLimit false', () => {
		let carolPublicNote: Misskey.entities.Note, carolPublicRenote: Misskey.entities.Note;
		const expected :{ text: string | null, createdAt: string }[] = [];
		beforeAll(async () => {
			await aAdmin.client.request('admin/federation/update-instance', { host: 'b.test', isQuarantineLimit: false });
			await sleep();
			strictEqual((await aAdmin.client.request('federation/show-instance', { host: 'b.test' }))?.isQuarantineLimited, false);
			carolPublicNote = (await carol.client.request('notes/create', { text: 'I am Carol!' })).createdNote;
			carolPublicRenote = (await carol.client.request('notes/create', { renoteId: carolPublicNote.id })).createdNote;

			expected.push({
				text: carolPublicNote.text,
				createdAt: carolPublicNote.createdAt,
			});
			expected.push({
				text: carolPublicRenote.text,
				createdAt: carolPublicRenote.createdAt,
			});
		});
		test('public', async () => {
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: carolInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('home', async () => {
			const carolHomeNote: Misskey.entities.Note = (await carol.client.request('notes/create', { text: 'home note', visibility: 'home' })).createdNote;
			const carolHomeRenote: Misskey.entities.Note = (await carol.client.request('notes/create', { renoteId: carolPublicNote.id, visibility: 'home' })).createdNote;
			expected.push({
				text: carolHomeNote.text,
				createdAt: carolHomeNote.createdAt,
			});
			expected.push({
				text: carolHomeRenote.text,
				createdAt: carolHomeRenote.createdAt,
			});
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: carolInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('followers', async () => {
			const carolFollowersNote: Misskey.entities.Note = (await carol.client.request('notes/create', { text: 'followers note', visibility: 'followers' })).createdNote;
			const carolFollowersRenote: Misskey.entities.Note = (await carol.client.request('notes/create', { renoteId: carolPublicNote.id, visibility: 'followers' })).createdNote;
			expected.push({
				text: carolFollowersNote.text,
				createdAt: carolFollowersNote.createdAt,
			});
			expected.push({
				text: carolFollowersRenote.text,
				createdAt: carolFollowersRenote.createdAt,
			});
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: carolInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('specified', async () => {
			const carolSpecifiedNote: Misskey.entities.Note = (await carol.client.request('notes/create', { text: 'specified note', visibility: 'specified', visibleUserIds: [bobInAliceHost.id] })).createdNote;
			expected.push({
				text: carolSpecifiedNote.text,
				createdAt: carolSpecifiedNote.createdAt,
			});
			await sleep();
			const fetch_notes = await bob.client.request('users/notes', { userId: carolInBobHost.id, withReplies: false, withRenotes: true });
			strictEqual(fetch_notes.length, expected.length, JSON.stringify(fetch_notes));
			deepStrictEqual(JSON.stringify(fetch_notes.map(note => {
				return {
					text: note.text,
					createdAt: note.createdAt,
				};
			})), JSON.stringify(Array.from(expected).reverse()));
		});
		test('followers-only note created during quarantine becomes fetchable after un-quarantining', async () => {
			// 隔離中は配信されず Signed Get も拒否されたノート。解除後は pull で取得できることを確認する。
			const resolved = await resolveRemoteNote('a.test', carolFollowersNoteDuringQuarantine.id, bob);
			strictEqual(resolved.text, carolFollowersNoteDuringQuarantine.text);
			strictEqual(resolved.visibility, 'followers');
		});
		test('specified note created during quarantine becomes fetchable after un-quarantining', async () => {
			// bob は visibleUserIds の対象。隔離中は拒否されたが、解除後は pull で取得できることを確認する。
			const resolved = await resolveRemoteNote('a.test', carolSpecifiedNoteDuringQuarantine.id, bob);
			strictEqual(resolved.text, carolSpecifiedNoteDuringQuarantine.text);
			strictEqual(resolved.visibility, 'specified');
		});
		//FIXME: assert.rejectsがundefinedを返す
		test.skip('block', async () => {
			await carol.client.request('blocking/create', { userId: bobInAliceHost.id });
			await sleep();
			const resolvedNote = await resolveRemoteNote('a.test', carolPublicNote.id, bob);
			await assert.rejects(
				async () => await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: '😅' }),
				(err: any) => {
					strictEqual(err.code, 'YOU_HAVE_BEEN_BLOCKED');
					return true;
				},
			);
			//ブロックしているのでリアクションが追加されない
			const note = await alice.client.request('notes/show', { noteId: carolPublicNote.id });
			strictEqual(Object.values(note.reactions).length, 0);
		});
	});

	describe('Blocked instance', () => {
		let alice: LoginUser, bob: LoginUser;
		let aliceInBobHost: Misskey.entities.UserDetailedNotMe;

		beforeAll(async () => {
			[alice, bob] = await Promise.all([
				createAccount('a.test'),
				createAccount('b.test'),
			]);
			[aliceInBobHost] = await Promise.all([
				resolveRemoteUser('a.test', alice.id, bob),
			]);
			await bob.client.request('following/create', { userId: aliceInBobHost.id });
			await waitForFollowRelation(bob, alice, 1);
		});

		test('followers-only note cannot be fetched from blocked instance', async () => {
			const noteText = `followers only ${Date.now()}`;
			const note = (await alice.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;
			const noteUri = `https://a.test/notes/${note.id}`;

			// Baseline: follower from b.test can fetch
			const resolvedBefore = await resolveRemoteNote('a.test', note.id, bob);
			strictEqual(resolvedBefore.text, noteText);

			// a.test blocks b.test
			await aAdmin.client.request('admin/update-meta', { blockedHosts: ['b.test'] });
			await sleep();

			try {
				await rejects(
					async () => await bob.client.request('ap/show', { uri: noteUri }),
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(err: any) => {
						strictEqual(err.code, 'REQUEST_FAILED');
						return true;
					},
				);
			} finally {
				// Cleanup
				await aAdmin.client.request('admin/update-meta', { blockedHosts: [] });
				await sleep();
			}
		});
	});
});
