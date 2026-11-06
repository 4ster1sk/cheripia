import assert, { rejects, strictEqual } from 'node:assert';
import { describe, test, beforeAll, afterAll, vi } from 'vitest';
import * as Misskey from 'misskey-js';
import { addCustomEmoji, createAccount, createModerator, deepStrictEqualWithExcludedFields, type LoginUser, resolveRemoteNote, resolveRemoteUser, sleep, uploadFile, waitForFollowRelation, WAIT_FOR_FEDERATION } from './utils.js';

describe('Note', () => {
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

	describe('Note content', () => {
		test('Consistency of Public Note', async () => {
			const image = await uploadFile('a.test', alice);
			const note = (await alice.client.request('notes/create', {
				text: 'I am Alice!',
				fileIds: [image.id],
				poll: {
					choices: ['neko', 'inu'],
					multiple: false,
					expiredAfter: 60 * 60 * 1000,
				},
			})).createdNote;

			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			deepStrictEqualWithExcludedFields(note, resolvedNote, [
				'id',
				'emojis',
				/** Consistency of files is checked at {@link file://./drive.test.ts}, so let's skip. */
				'fileIds',
				'files',
				/** @see https://github.com/misskey-dev/misskey/issues/12409 */
				'reactionAcceptance',
				'userId',
				'user',
				'uri',
			]);
			strictEqual(aliceInB.id, resolvedNote.userId);
		});

		test('Consistency of reply', async () => {
			const _replyedNote = (await alice.client.request('notes/create', {
				text: 'a',
			})).createdNote;
			const note = (await alice.client.request('notes/create', {
				text: 'b',
				replyId: _replyedNote.id,
			})).createdNote;
			// NOTE: the repliedCount is incremented, so fetch again
			const replyedNote = await alice.client.request('notes/show', { noteId: _replyedNote.id });
			strictEqual(replyedNote.repliesCount, 1);

			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			deepStrictEqualWithExcludedFields(note, resolvedNote, [
				'id',
				'emojis',
				'replyId',
				'reply',
				'userId',
				'user',
				'uri',
			]);
			assert(resolvedNote.replyId != null);
			assert(resolvedNote.reply != null);
			deepStrictEqualWithExcludedFields(replyedNote, resolvedNote.reply, [
				'id',
				// TODO: why clippedCount loses consistency?
				'clippedCount',
				'emojis',
				'userId',
				'user',
				'uri',
				// flaky because this is parallelly incremented, so let's check it below
				'repliesCount',
			]);
			strictEqual(aliceInB.id, resolvedNote.userId);

			await vi.waitFor(async () => {
				const resolvedReplyedNote = await bob.client.request('notes/show', { noteId: resolvedNote.replyId! });
				strictEqual(resolvedReplyedNote.repliesCount, 1);
			}, WAIT_FOR_FEDERATION);
		});

		test('Consistency of Renote', async () => {
			// NOTE: the renoteCount is not incremented, so no need to fetch again
			const renotedNote = (await alice.client.request('notes/create', {
				text: 'a',
			})).createdNote;
			const note = (await alice.client.request('notes/create', {
				text: 'b',
				renoteId: renotedNote.id,
			})).createdNote;

			const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
			deepStrictEqualWithExcludedFields(note, resolvedNote, [
				'id',
				'emojis',
				'renoteId',
				'renote',
				'userId',
				'user',
				'uri',
			]);
			assert(resolvedNote.renoteId != null);
			assert(resolvedNote.renote != null);
			deepStrictEqualWithExcludedFields(renotedNote, resolvedNote.renote, [
				'id',
				'emojis',
				'userId',
				'user',
				'uri',
			]);
			strictEqual(aliceInB.id, resolvedNote.userId);
		});
	});

	describe('Other props', () => {
		test('localOnly', async () => {
			const note = (await alice.client.request('notes/create', { text: 'a', localOnly: true })).createdNote;
			const show_note = await bob.client.request('ap/show', { uri: `https://a.test/notes/${note.id}` });
			strictEqual(true, show_note.type === 'Note');
		});
	});

	describe('Deletion', () => {
		describe('Check Delete is delivered', () => {
			describe('To followers', () => {
				let carol: LoginUser;

				beforeAll(async () => {
					carol = await createAccount('a.test');

					await carol.client.request('following/create', { userId: bobInA.id });
					await waitForFollowRelation(carol, bob, 1);
				});

				test('Check', async () => {
					const note = (await bob.client.request('notes/create', { text: 'I\'m Bob.' })).createdNote;
					const noteInA = await resolveRemoteNote('b.test', note.id, carol);
					await bob.client.request('notes/delete', { noteId: note.id });

					await vi.waitFor(async () => await rejects(
						async () => await carol.client.request('notes/show', { noteId: noteInA.id }),
						(err: any) => {
							strictEqual(err.code, 'NO_SUCH_NOTE');
							return true;
						},
					), WAIT_FOR_FEDERATION);
				});

				afterAll(async () => {
					await carol.client.request('following/delete', { userId: bobInA.id });
					await waitForFollowRelation(carol, bob, 0);
				});
			});

			describe('To renoted and not followed user', () => {
				test('Check', async () => {
					const note = (await bob.client.request('notes/create', { text: 'I\'m Bob.' })).createdNote;
					const noteInA = await resolveRemoteNote('b.test', note.id, alice);
					await alice.client.request('notes/create', { renoteId: noteInA.id });
					await vi.waitFor(async () => {
						const renotes = await bob.client.request('notes/renotes', { noteId: note.id });
						strictEqual(renotes.length, 1);
					}, WAIT_FOR_FEDERATION);

					await bob.client.request('notes/delete', { noteId: note.id });

					await vi.waitFor(async () => await rejects(
						async () => await alice.client.request('notes/show', { noteId: noteInA.id }),
						(err: any) => {
							strictEqual(err.code, 'NO_SUCH_NOTE');
							return true;
						},
					), WAIT_FOR_FEDERATION);
				});
			});

			describe('To replied and not followed user', () => {
				test('Check', async () => {
					const note = (await bob.client.request('notes/create', { text: 'I\'m Bob.' })).createdNote;
					const noteInA = await resolveRemoteNote('b.test', note.id, alice);
					await alice.client.request('notes/create', { text: 'Hello Bob!', replyId: noteInA.id });
					await vi.waitFor(async () => {
						const replies = await bob.client.request('notes/replies', { noteId: note.id });
						strictEqual(replies.length, 1);
					}, WAIT_FOR_FEDERATION);

					await bob.client.request('notes/delete', { noteId: note.id });

					await vi.waitFor(async () => await rejects(
						async () => await alice.client.request('notes/show', { noteId: noteInA.id }),
						(err: any) => {
							strictEqual(err.code, 'NO_SUCH_NOTE');
							return true;
						},
					), WAIT_FOR_FEDERATION);
				});
			});

			/**
			 * FIXME: not delivered
			 * @see https://github.com/misskey-dev/misskey/issues/15548
			 */
			describe('To only resolved and not followed user', () => {
				test.skip('Check', async () => {
					const note = (await bob.client.request('notes/create', { text: 'I\'m Bob.' })).createdNote;
					const noteInA = await resolveRemoteNote('b.test', note.id, alice);
					await sleep();

					await bob.client.request('notes/delete', { noteId: note.id });
					await sleep();

					await rejects(
						async () => await alice.client.request('notes/show', { noteId: noteInA.id }),
						(err: any) => {
							strictEqual(err.code, 'NO_SUCH_NOTE');
							return true;
						},
					);
				});
			});
		});

		describe('Deletion of remote user\'s note for moderation', () => {
			let note: Misskey.entities.Note;

			test('Alice post is deleted in B', async () => {
				note = (await alice.client.request('notes/create', { text: 'Hello' })).createdNote;
				const noteInB = await resolveRemoteNote('a.test', note.id, bob);
				const bMod = await createModerator('b.test');
				await bMod.client.request('notes/delete', { noteId: noteInB.id });
				await rejects(
					async () => await bob.client.request('notes/show', { noteId: noteInB.id }),
					(err: any) => {
						strictEqual(err.code, 'NO_SUCH_NOTE');
						return true;
					},
				);
			});

			/**
			 * FIXME: implement soft deletion as well as user?
			 *        @see https://github.com/misskey-dev/misskey/issues/11437
			 */
			test.skip('Not found even if resolve again', async () => {
				const noteInB = await resolveRemoteNote('a.test', note.id, bob);
				await rejects(
					async () => await bob.client.request('notes/show', { noteId: noteInB.id }),
					(err: any) => {
						strictEqual(err.code, 'NO_SUCH_NOTE');
						return true;
					},
				);
			});
		});
	});

	describe('Reaction', () => {
		async function waitForReactions(noteId: string, count: number): Promise<Misskey.entities.NotesReactionsResponse> {
			return await vi.waitFor(async () => {
				const reactions = await alice.client.request('notes/reactions', { noteId });
				strictEqual(reactions.length, count);
				return reactions;
			}, WAIT_FOR_FEDERATION);
		}

		describe('Consistency', () => {
			test('Unicode reaction', async () => {
				const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
				const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
				const reaction = '😅';
				await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction });

				const reactions = await waitForReactions(note.id, 1);
				strictEqual(reactions[0].type, reaction);
				strictEqual(reactions[0].user.id, bobInA.id);
			});

			test('Custom emoji reaction', async () => {
				const note = (await alice.client.request('notes/create', { text: 'a' })).createdNote;
				const resolvedNote = await resolveRemoteNote('a.test', note.id, bob);
				const emoji = await addCustomEmoji('b.test');
				await bob.client.request('notes/reactions/create', { noteId: resolvedNote.id, reaction: `:${emoji.name}:` });

				const reactions = await waitForReactions(note.id, 1);
				strictEqual(reactions[0].type, `:${emoji.name}@b.test:`);
				strictEqual(reactions[0].user.id, bobInA.id);
			});
		});

		describe('Acceptance', () => {
			test('Even if likeOnly, remote users can react with custom emoji, but it is converted to like', async () => {
				const note = (await alice.client.request('notes/create', { text: 'a', reactionAcceptance: 'likeOnly' })).createdNote;
				const noteInB = await resolveRemoteNote('a.test', note.id, bob);
				const emoji = await addCustomEmoji('b.test');
				await bob.client.request('notes/reactions/create', { noteId: noteInB.id, reaction: `:${emoji.name}:` });

				const reactions = await waitForReactions(note.id, 1);
				strictEqual(reactions[0].type, '❤');
			});

			//https://github.com/yojo-art/cherrypick/pull/631
			test('絵文字のセンシティブフラグが連合している場合、センシティブリアクションはハートに変換される', async () => {
				const note = (await alice.client.request('notes/create', { text: 'a', reactionAcceptance: 'nonSensitiveOnly' })).createdNote;
				const noteInB = await resolveRemoteNote('a.test', note.id, bob);
				const emoji = await addCustomEmoji('b.test', { isSensitive: true });
				await bob.client.request('notes/reactions/create', { noteId: noteInB.id, reaction: `:${emoji.name}:` });

				const reactions = await waitForReactions(note.id, 1);
				strictEqual(reactions.length, 1);
				strictEqual(reactions[0].type, '❤');
			});
		});
	});

	describe('Poll', () => {
		describe('Any remote user\'s vote is delivered to the author', () => {
			let carol: LoginUser;

			beforeAll(async () => {
				carol = await createAccount('a.test');
			});

			test('Bob creates poll and receives a vote from Carol', async () => {
				const note = (await bob.client.request('notes/create', { poll: { choices: ['inu', 'neko'] } })).createdNote;
				const noteInA = await resolveRemoteNote('b.test', note.id, carol);
				await carol.client.request('notes/polls/vote', { noteId: noteInA.id, choice: 0 });

				await vi.waitFor(async () => {
					const noteAfterVote = await bob.client.request('notes/show', { noteId: note.id });
					assert(noteAfterVote.poll != null);
					strictEqual(noteAfterVote.poll.choices[0].votes, 1);
					strictEqual(noteAfterVote.poll.choices[1].votes, 0);
				}, WAIT_FOR_FEDERATION);
			});
		});

		describe('Local user\'s vote is delivered to the author\'s remote followers', () => {
			let bobRemoteFollower: LoginUser, localVoter: LoginUser;

			beforeAll(async () => {
				[
					bobRemoteFollower,
					localVoter,
				] = await Promise.all([
					createAccount('a.test'),
					createAccount('b.test'),
				]);

				await bobRemoteFollower.client.request('following/create', { userId: bobInA.id });
				await waitForFollowRelation(bobRemoteFollower, bob, 1);
			});

			test('A vote in Bob\'s server is delivered to Bob\'s remote followers', async () => {
				const note = (await bob.client.request('notes/create', { poll: { choices: ['inu', 'neko'] } })).createdNote;
				// NOTE: resolve before voting
				const noteInA = await resolveRemoteNote('b.test', note.id, bobRemoteFollower);
				await localVoter.client.request('notes/polls/vote', { noteId: note.id, choice: 0 });

				await vi.waitFor(async () => {
					const noteAfterVote = await bobRemoteFollower.client.request('notes/show', { noteId: noteInA.id });
					assert(noteAfterVote.poll != null);
					strictEqual(noteAfterVote.poll.choices[0].votes, 1);
					strictEqual(noteAfterVote.poll.choices[1].votes, 0);
				}, WAIT_FOR_FEDERATION);
			});
		});
	});

	describe('Visibility', () => {
		test('Followers-only note can be fetched after following', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const authorInA = await resolveRemoteUser('b.test', author.id, follower);

			const note = (await author.client.request('notes/create', {
				text: 'secret',
				visibility: 'followers',
			})).createdNote;

			const noteUri = `https://b.test/notes/${note.id}`;

			// Follower tries to fetch the note (should fail)
			await rejects(
				async () => await follower.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);

			// Follower follows Author
			await follower.client.request('following/create', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 1);

			// Follower tries to fetch the note again (should success)
			const resolvedNote = await resolveRemoteNote('b.test', note.id, follower);
			strictEqual(resolvedNote.text, 'secret');
		});

		test('Followers-only note can be fetched via Announce if the receiver follows the announcer', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const authorInA = await resolveRemoteUser('b.test', author.id, follower);

			// Author creates a followers-only note
			const noteText = `followers only ${Date.now()}`;

			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;

			// Follower follows Author
			await follower.client.request('following/create', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 1);

			// Author renote the note
			const authorRenote = await author.client.request('notes/create', {
				renoteId: note.id,
			});

			await sleep();

			// Follower should be able to see the renote and the original note
			const timeline = await follower.client.request('notes/timeline', { limit: 10 });
			const renoteUri = `https://b.test/notes/${authorRenote.createdNote.id}/activity`;
			const renoteInA = timeline.find(n => n.uri === renoteUri);

			assert(renoteInA != null);
			assert(renoteInA.renote != null);
			strictEqual(renoteInA.renote.text, noteText);
			strictEqual(renoteInA.renote.visibility, 'followers');
		});

		test('Followers-only note can be fetched via Reply if the receiver follows the author', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const authorInA = await resolveRemoteUser('b.test', author.id, follower);

			const noteText = `followers only ${Date.now()}`;

			// Author creates a followers-only note
			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;

			const noteUri = `https://b.test/notes/${note.id}`;

			// Follower tries to fetch the note (should fail)
			await rejects(
				async () => await follower.client.request('ap/show', { uri: noteUri }),
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);

			// Follower follows Author
			await follower.client.request('following/create', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 1);

			// Author replies to the note
			const reply = (await author.client.request('notes/create', {
				text: 'reply to followers only',
				replyId: note.id,
				visibility: 'followers',
			})).createdNote;

			await sleep();

			// Follower should be able to see the reply and the original note
			const timeline = await follower.client.request('notes/timeline', { limit: 10 });
			const replyInA = timeline.find(n => n.uri === `https://b.test/notes/${reply.id}`);

			assert(replyInA != null);
			assert(replyInA.reply != null);
			strictEqual(replyInA.reply.text, noteText);
			strictEqual(replyInA.reply.visibility, 'followers');
		});

		test('Followers-only note can be fetched via Quote if the receiver follows the author', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const authorInA = await resolveRemoteUser('b.test', author.id, follower);

			// Author creates a followers-only note
			const noteText = `followers only source ${Date.now()}`;
			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;

			const noteUri = `https://b.test/notes/${note.id}`;

			// Follower tries to fetch the note (should fail)
			await rejects(
				async () => await follower.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);

			// Follower follows Author
			await follower.client.request('following/create', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 1);

			// Author quotes the note
			const quoteText = `quoting secret note ${Date.now()}`;
			const quote = (await author.client.request('notes/create', {
				text: quoteText,
				renoteId: note.id,
				visibility: 'public',
			})).createdNote;
			await sleep();

			// Follower should be able to see the Quote and the Original Note
			const timeline = await follower.client.request('notes/timeline', { limit: 10 });
			const quotesInA = timeline.filter(n => n.text === quoteText);

			const quoteUri = `https://b.test/notes/${quote.id}`;

			// Check duplication of quote
			strictEqual(quotesInA.length, 1);

			const quoteInA = quotesInA[0];
			strictEqual(quoteInA.text, quoteText);
			strictEqual(quoteInA.uri, quoteUri);

			// Check renote content
			assert(quoteInA.renote != null);
			strictEqual(quoteInA.renote.text, noteText);
			strictEqual(quoteInA.renote.visibility, 'followers');
		});

		async function waitForBlocked(blocked: LoginUser, blockerId: string): Promise<void> {
			await vi.waitFor(async () => {
				const blocker = await blocked.client.request('users/show', { userId: blockerId });
				strictEqual(blocker.isBlocked, true);
			}, WAIT_FOR_FEDERATION);
		}

		test('Specified note can be fetched by visible user', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const [authorInA, followerInB] = await Promise.all([
				resolveRemoteUser('b.test', author.id, follower),
				resolveRemoteUser('a.test', follower.id, author),
			]);

			const noteText = `specified only ${Date.now()}`;
			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'specified',
				visibleUserIds: [followerInB.id],
			})).createdNote;

			const noteUri = `https://b.test/notes/${note.id}`;

			// Non-visible user tries to fetch the note (should fail)
			const [outsider] = await Promise.all([
				createAccount('a.test'),
			]);
			const authorInAForOutsider = await resolveRemoteUser('b.test', author.id, outsider);
			await outsider.client.request('following/create', { userId: authorInAForOutsider.id });
			await sleep();

			await rejects(
				async () => await outsider.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);

			// Visible follower fetches the note (should success)
			const resolvedNote = await resolveRemoteNote('b.test', note.id, follower);
			strictEqual(resolvedNote.text, noteText);
			strictEqual(resolvedNote.visibility, 'specified');
		});

		test('Followers-only note cannot be fetched after blocking the author', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const [authorInA, followerInB] = await Promise.all([
				resolveRemoteUser('b.test', author.id, follower),
				resolveRemoteUser('a.test', follower.id, author),
			]);

			const noteText = `followers only ${Date.now()}`;
			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;

			const noteUri = `https://b.test/notes/${note.id}`;

			// Follower follows Author and fetches the note (should success)
			await follower.client.request('following/create', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 1);
			const resolvedNote = await resolveRemoteNote('b.test', note.id, follower);
			strictEqual(resolvedNote.text, noteText);
			strictEqual(resolvedNote.visibility, 'followers');

			// Follower blocks Author
			await follower.client.request('blocking/create', { userId: authorInA.id });
			await waitForBlocked(author, followerInB.id);

			// Blocked follower tries to fetch the note again (should fail)
			await rejects(
				async () => await follower.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);
		});

		test('Public notes of a blocked author are not returned by ap/show (cached and fresh)', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const [authorInA, followerInB] = await Promise.all([
				resolveRemoteUser('b.test', author.id, follower),
				resolveRemoteUser('a.test', follower.id, author),
			]);

			const cachedText = `public cached ${Date.now()}`;
			const cachedNote = (await author.client.request('notes/create', {
				text: cachedText,
				visibility: 'public',
			})).createdNote;
			const cachedUri = `https://b.test/notes/${cachedNote.id}`;

			// ブロック前は公開ノートを取得できる
			const before = await resolveRemoteNote('b.test', cachedNote.id, follower);
			strictEqual(before.text, cachedText);

			// Follower blocks Author (双方向のブロックが両インスタンスに反映されるまで待つ)
			await follower.client.request('blocking/create', { userId: authorInA.id });
			await waitForBlocked(author, followerInB.id);

			// DB キャッシュ済みの公開ノート: ap/show の検索経路 (filterVisibleNote) で除外され
			// NO_SUCH_OBJECT になる (origin は公開ノートに認証を要求しないため、
			// クライアント側のブロック判定が決定的に効く)
			await rejects(
				async () => await follower.client.request('ap/show', { uri: cachedUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'NO_SUCH_OBJECT');
					return true;
				},
			);

			// ブロック後に作成された (まだキャッシュされていない) 公開ノート:
			// フェッチ自体は成功するが createdNote のブロック判定で結果が除外される
			const freshNote = (await author.client.request('notes/create', {
				text: `public fresh ${Date.now()}`,
				visibility: 'public',
			})).createdNote;
			await rejects(
				async () => await follower.client.request('ap/show', { uri: `https://b.test/notes/${freshNote.id}` }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'NO_SUCH_OBJECT');
					return true;
				},
			);
		});

		test('Followers-only note cannot be fetched via ap/show after unfollowing', async () => {
			const [author, follower] = await Promise.all([
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const authorInA = await resolveRemoteUser('b.test', author.id, follower);

			const noteText = `followers only ${Date.now()}`;
			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;
			const noteUri = `https://b.test/notes/${note.id}`;

			// Follow and fetch (note gets cached locally)
			await follower.client.request('following/create', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 1);
			const resolvedNote = await resolveRemoteNote('b.test', note.id, follower);
			strictEqual(resolvedNote.text, noteText);

			// Follower unfollows Author
			await follower.client.request('following/delete', { userId: authorInA.id });
			await waitForFollowRelation(follower, author, 0);

			// ローカルDBにキャッシュが残っていても、remote の followers/specified は
			// 常に origin へ再取得されるため取得できない
			await rejects(
				async () => await follower.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);
		});
	});

	describe('Signed Get fallback for Announce (3 instances)', () => {
		test('Followers-only note of c.test is ingested at b.test via Announce with signed get by a local follower of the announcer', async () => {
			const [author, follower, outsider] = await Promise.all([
				createAccount('c.test'),
				createAccount('b.test'),
				createAccount('a.test'),
			]);

			const authorInB = await resolveRemoteUser('c.test', author.id, follower);

			// 原投稿はフォロー成立前に作成する。フォロー後に作成すると通常の Create 配送で
			// b.test に取り込まれ、Announce の保存用再取得が Signed Get を経ずに済んでしまう。
			const noteText = `c.test followers only ${Date.now()}`;
			const note = (await author.client.request('notes/create', {
				text: noteText,
				visibility: 'followers',
			})).createdNote;
			const noteUri = `https://c.test/notes/${note.id}`;

			await follower.client.request('following/create', { userId: authorInB.id });
			await waitForFollowRelation(follower, author, 1);

			// Announce の時点で b.test は原投稿を持っていないこと (Signed Get フォールバックの前提)
			const beforeAnnounce = await follower.client.request('users/notes', {
				userId: authorInB.id,
				limit: 100,
			});
			assert(
				!beforeAnnounce.some(n => n.uri === noteUri),
				'original note must not be ingested at b.test before the announce',
			);

			// 無関係な a.test のユーザーは取得できない (origin は未認証・権限なしに 403 を返す)
			await rejects(
				async () => await outsider.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);

			// Author が自身のフォロワー限定投稿をリノート (Announce)。
			// b.test での anonymous resolve は 403 で失敗し、
			// announcer (author) のローカルフォロワー (follower) の鍵による Signed Get で再解決される。
			await author.client.request('notes/create', { renoteId: note.id });

			await vi.waitFor(async () => {
				const timeline = await follower.client.request('notes/timeline', { limit: 10 });
				const announce = timeline.find(n =>
					n.user.username === author.username &&
					n.user.host === 'c.test' &&
					n.renote != null &&
					n.renote.uri === noteUri,
				);
				assert(announce != null, 'announce not found in follower timeline');
				assert(announce.renote != null);
				strictEqual(announce.renote.text, noteText);
				strictEqual(announce.renote.visibility, 'followers');
			}, WAIT_FOR_FEDERATION);

			// b.test で解決されたノートが a.test に露出しないこと
			await rejects(
				async () => await outsider.client.request('ap/show', { uri: noteUri }),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(err: any) => {
					strictEqual(err.code, 'REQUEST_FAILED');
					return true;
				},
			);
		});
	});
});
