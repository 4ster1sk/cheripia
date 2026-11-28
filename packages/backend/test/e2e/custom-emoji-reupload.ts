/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, yojo-art team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomInt } from 'node:crypto';
import Fastify from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, test, vi } from 'vitest';
import {
	api,
	failedApiCall,
	initTestDb,
	role,
	signup,
	startJobQueue,
	uploadFile,
} from '../utils.js';
import { IdService } from '@/core/IdService.js';
import { loadConfig } from '@/config.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiEmoji } from '@/models/Emoji.js';
import { ZipArchive } from '@/misc/zip.js';
import type { INestApplicationContext } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type * as misskey from 'misskey-js';

describe('custom-emoji-reupload', () => {
	let queue: INestApplicationContext;
	let root: misskey.entities.SignupResponse;
	let otherAdmin: misskey.entities.SignupResponse;
	let roleAdmin: misskey.entities.Role;
	let db: DataSource;
	let driveFilesRepository: Repository<MiDriveFile>;
	let emojisRepository: Repository<MiEmoji>;
	let idService: IdService;

	const remote = Fastify();
	const remoteImages = new Map<string, { type: string; body: Buffer }>();
	let remoteUrl: string;
	let jpegBytes: Buffer;
	let pngBytes: Buffer;
	let tempDir: string;

	async function createSolidJpeg(): Promise<Buffer> {
		return sharp({
			create: {
				width: 16,
				height: 16,
				channels: 3,
				background: { r: randomInt(0, 256), g: randomInt(0, 256), b: randomInt(0, 256) },
			},
		}).jpeg().toBuffer();
	}

	async function createSolidPng(): Promise<Buffer> {
		return sharp({
			create: {
				width: 16,
				height: 16,
				channels: 4,
				background: { r: randomInt(0, 256), g: randomInt(0, 256), b: randomInt(0, 256), alpha: 1 },
			},
		}).png().toBuffer();
	}

	async function assertSystemOwned(url: string): Promise<MiDriveFile> {
		const file = await driveFilesRepository.findOneByOrFail({ url });
		assert.strictEqual(file.userId, null, 'ファイルはシステム所有である');
		assert.strictEqual(file.userHost, null, 'ファイルの所有者ホストは null である');
		const fetchRes = await fetch(url);
		assert.strictEqual(fetchRes.status, 200, '絵文字の URL は参照可能である');
		return file;
	}

	beforeAll(async () => {
		queue = await startJobQueue();
		db = await initTestDb(true);
		driveFilesRepository = db.getRepository(MiDriveFile);
		emojisRepository = db.getRepository(MiEmoji);
		idService = new IdService(loadConfig());

		root = await signup({ username: 'root' });
		otherAdmin = await signup({ username: 'other_admin' });

		roleAdmin = await role(root, { isAdministrator: true, name: 'Admin Role' }, {
			canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
		});
		await api('admin/roles/assign', { userId: root.id, roleId: roleAdmin.id }, root);
		await api('admin/roles/assign', { userId: otherAdmin.id, roleId: roleAdmin.id }, root);

		jpegBytes = await fs.promises.readFile(new URL('../resources/192.jpg', import.meta.url));
		pngBytes = await fs.promises.readFile(new URL('../resources/192.png', import.meta.url));

		remote.get<{ Params: { name: string } }>('/:name', async (request, reply) => {
			const image = remoteImages.get(request.params.name);
			if (image == null) return reply.code(404).send();
			return reply.type(image.type).send(image.body);
		});
		remoteUrl = await remote.listen({ port: 0, host: '127.0.0.1' });

		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cheripia-custom-emoji-'));
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await queue?.close();
		await db?.destroy();
		await remote.close();
		if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	test('絵文字登録時にファイルがシステムユーザーとして再アップロードされ、元ファイルは削除される', async () => {
		const upRes = await uploadFile(root, { path: '192.jpg' });
		assert.strictEqual(upRes.status, 200);
		const originalFile = upRes.body!;
		const emojiName = 'test_reupload_' + originalFile.id.slice(0, 6);

		const addRes = await api('admin/emoji/add', {
			name: emojiName,
			fileId: originalFile.id,
		}, root);
		assert.strictEqual(addRes.status, 200);
		const emoji = addRes.body!;

		// 再アップロードされた URL は元とは異なる
		assert.notStrictEqual(emoji.url, originalFile.url);

		// 元ファイルは削除済み
		await failedApiCall({
			endpoint: 'drive/files/show',
			parameters: { fileId: originalFile.id },
			user: root,
		}, {
			status: 400,
			code: 'NO_SUCH_FILE',
			id: '067bc436-2718-4795-b0fb-ecbe43949e31',
		});

		// 新しいファイルの URL は参照可能
		const fetchRes = await fetch(emoji.url);
		assert.strictEqual(fetchRes.status, 200);

		// 絵文字一覧に存在する
		const listRes = await api('admin/emoji/list', { query: emojiName }, root);
		assert.strictEqual(listRes.status, 200);
		assert.ok(listRes.body!.some((e: misskey.entities.EmojiDetailed) => e.name === emojiName));
	});

	test('絵文字登録者がアカウントを削除しても絵文字が残る', async () => {
		const uploader = await signup({ username: 'uploader' });
		await api('admin/roles/assign', { userId: uploader.id, roleId: roleAdmin.id }, root);

		const upRes = await uploadFile(uploader, { path: '192.jpg' });
		assert.strictEqual(upRes.status, 200);
		const originalFile = upRes.body!;
		const emojiName = 'test_survive_' + originalFile.id.slice(0, 6);

		const addRes = await api('admin/emoji/add', {
			name: emojiName,
			fileId: originalFile.id,
		}, uploader);
		assert.strictEqual(addRes.status, 200);
		const emoji = addRes.body!;

		// アカウント削除前に uploader のファイルをアップロード（削除ジョブ完了確認用）
		const refUpRes = await uploadFile(uploader, { path: '192.png' });
		assert.strictEqual(refUpRes.status, 200);
		const refFile = refUpRes.body!;

		// uploader のアカウントを削除
		const delRes = await api('i/delete-account', { password: 'test' }, uploader);
		assert.strictEqual(delRes.status, 204);

		// uploader のファイルが消えるまで待つ（削除ジョブ完了を待つ）
		await vi.waitFor(async () => {
			const res = await fetch(refFile.url);
			assert.notStrictEqual(res.status, 200);
		}, { timeout: 30000, interval: 500 });

		// otherAdmin で絵文字が残っていることを確認
		const listRes = await api('admin/emoji/list', { query: emojiName }, otherAdmin);
		assert.strictEqual(listRes.status, 200);
		assert.ok(listRes.body!.some((e: misskey.entities.EmojiDetailed) => e.name === emojiName));

		// 絵文字の URL も参照可能
		const fetchRes = await fetch(emoji.url);
		assert.strictEqual(fetchRes.status, 200);
	});

	test('add はメタデータを保持し、システム所有のファイルを作成する', async () => {
		const upRes = await uploadFile(root, { path: '192.jpg' });
		assert.strictEqual(upRes.status, 200);
		const originalFile = upRes.body!;
		const emojiName = 'test_meta_' + originalFile.id.slice(0, 6);

		const addRes = await api('admin/emoji/add', {
			name: emojiName,
			fileId: originalFile.id,
			category: 'test-category',
			aliases: ['alias_a', 'alias_b'],
			license: 'CC0',
			isSensitive: true,
			localOnly: true,
			copyPermission: 'allow',
			usageInfo: 'usage info',
			author: 'test author',
			description: 'test description',
			isBasedOn: 'https://example.com/original-emoji',
		}, root);
		assert.strictEqual(addRes.status, 200);
		const emoji = addRes.body!;

		assert.strictEqual(emoji.name, emojiName);
		assert.strictEqual(emoji.category, 'test-category');
		assert.deepStrictEqual(emoji.aliases, ['alias_a', 'alias_b']);
		assert.strictEqual(emoji.license, 'CC0');
		assert.strictEqual(emoji.isSensitive, true);
		assert.strictEqual(emoji.localOnly, true);
		assert.strictEqual(emoji.copyPermission, 'allow');
		assert.strictEqual(emoji.usageInfo, 'usage info');
		assert.strictEqual(emoji.author, 'test author');
		assert.strictEqual(emoji.description, 'test description');
		assert.strictEqual(emoji.isBasedOn, 'https://example.com/original-emoji');
		assert.strictEqual(emoji.host, null);

		await assertSystemOwned(emoji.url);
	});

	test('同じ URL を参照する drive_file が他にある場合、元ファイルを削除しない', async () => {
		const aRes = await uploadFile(root, { path: '192.jpg' });
		assert.strictEqual(aRes.status, 200);
		const fileA = aRes.body!;

		const bRes = await uploadFile(root, { path: '192.jpg' });
		assert.strictEqual(bRes.status, 200);
		const fileB = bRes.body!;

		assert.notStrictEqual(fileA.id, fileB.id);

		// fileB が同じ URL を参照している状態を作る
		await driveFilesRepository.update(fileB.id, { url: fileA.url });

		const emojiName = 'test_refcount_' + fileA.id.slice(0, 6);
		const addRes = await api('admin/emoji/add', {
			name: emojiName,
			fileId: fileA.id,
		}, root);
		assert.strictEqual(addRes.status, 200);

		// 参照が残っているので fileA / fileB のどちらも削除されない
		assert.ok(await driveFilesRepository.findOneBy({ id: fileA.id }), 'fileA は残る');
		assert.ok(await driveFilesRepository.findOneBy({ id: fileB.id }), 'fileB は残る');
	});

	test('update は fileId 指定で再アップロードし、新しいユーザーファイルを削除する', async () => {
		const originalRes = await uploadFile(root, { path: '192.jpg' });
		assert.strictEqual(originalRes.status, 200);
		const originalFile = originalRes.body!;
		const emojiName = 'test_update_' + originalFile.id.slice(0, 6);

		const addRes = await api('admin/emoji/add', {
			name: emojiName,
			fileId: originalFile.id,
			category: 'before-category',
			license: 'before-license',
			author: 'before-author',
		}, root);
		assert.strictEqual(addRes.status, 200);
		const added = addRes.body!;

		const newFileRes = await uploadFile(root, { path: '192.png' });
		assert.strictEqual(newFileRes.status, 200);
		const newFile = newFileRes.body!;

		const updateRes = await api('admin/emoji/update', {
			id: added.id,
			fileId: newFile.id,
		}, root);
		assert.strictEqual(updateRes.status, 204);

		const listRes = await api('admin/emoji/list', { query: emojiName }, root);
		assert.strictEqual(listRes.status, 200);
		const updated = listRes.body!.find((e: misskey.entities.EmojiDetailed) => e.name === emojiName);
		assert.ok(updated);

		// URL が変わり、参照可能なシステム所有ファイルになっている
		assert.notStrictEqual(updated.url, added.url);
		assert.notStrictEqual(updated.url, newFile.url);
		await assertSystemOwned(updated.url);

		// 新しいユーザーファイルは削除済み
		assert.strictEqual(await driveFilesRepository.findOneBy({ id: newFile.id }), null);
		await failedApiCall({
			endpoint: 'drive/files/show',
			parameters: { fileId: newFile.id },
			user: root,
		}, {
			status: 400,
			code: 'NO_SUCH_FILE',
			id: '067bc436-2718-4795-b0fb-ecbe43949e31',
		});

		// 指定していないメタデータは保持される
		assert.strictEqual(updated.category, 'before-category');
		assert.strictEqual(updated.license, 'before-license');
		assert.strictEqual(updated.author, 'before-author');
	});

	test('steal はリモート絵文字をメタデータ付きでローカルへ取り込む', async () => {
		const remoteEmojiName = 'test_steal_' + Math.random().toString(36).slice(2, 8);
		const remoteHost = 'remote.test';
		const remoteOriginalUrl = `${remoteUrl}/steal.jpg`;

		// 他テストでアップロード済みのファイルと md5 が衝突しないよう、テスト固有の画像を配信する
		remoteImages.set('steal.jpg', { type: 'image/jpeg', body: await createSolidJpeg() });

		await emojisRepository.insert({
			id: idService.gen(),
			updatedAt: new Date(),
			name: remoteEmojiName,
			host: remoteHost,
			category: 'remote-category',
			originalUrl: remoteOriginalUrl,
			publicUrl: remoteOriginalUrl,
			uri: remoteOriginalUrl,
			type: 'image/jpeg',
			aliases: ['remote_alias'],
			license: 'remote-license',
			localOnly: false,
			isSensitive: false,
			usageInfo: 'remote usage',
			description: 'remote description',
			author: 'remote author',
			copyPermission: 'allow',
			isBasedOn: 'https://example.com/remote-base',
		});

		const stealRes = await api('admin/emoji/steal', {
			name: remoteEmojiName,
			host: remoteHost,
			licenseReadText: null,
		}, root);
		assert.strictEqual(stealRes.status, 200);
		const emoji = stealRes.body!;

		assert.strictEqual(emoji.host, null);
		assert.strictEqual(emoji.importFrom, remoteHost);
		assert.strictEqual(emoji.category, 'remote-category');
		assert.deepStrictEqual(emoji.aliases, ['remote_alias']);
		assert.strictEqual(emoji.license, 'remote-license');
		assert.strictEqual(emoji.author, 'remote author');
		assert.strictEqual(emoji.description, 'remote description');
		assert.strictEqual(emoji.isBasedOn, 'https://example.com/remote-base');

		await assertSystemOwned(emoji.url);
	});

	test('steal は一般ユーザーが同じ MD5 のファイルを所有していても削除せずシステム所有で新規作成する', async () => {
		const sharedImage = await createSolidPng();
		const userUpRes = await uploadFile(otherAdmin, {
			blob: new Blob([new Uint8Array(sharedImage)], { type: 'image/png' }),
			name: 'user-shared.png',
		});
		assert.strictEqual(userUpRes.status, 200);
		const userFile = userUpRes.body!;

		const remoteEmojiName = 'test_steal_md5_' + Math.random().toString(36).slice(2, 8);
		const remoteHost = 'remote.test';
		const remoteOriginalUrl = `${remoteUrl}/steal-md5.png`;
		remoteImages.set('steal-md5.png', { type: 'image/png', body: sharedImage });

		await emojisRepository.insert({
			id: idService.gen(),
			updatedAt: new Date(),
			name: remoteEmojiName,
			host: remoteHost,
			category: null,
			originalUrl: remoteOriginalUrl,
			publicUrl: remoteOriginalUrl,
			uri: remoteOriginalUrl,
			type: 'image/png',
			aliases: [],
			license: null,
			localOnly: false,
			isSensitive: false,
			usageInfo: null,
			description: null,
			author: null,
			copyPermission: 'allow',
			isBasedOn: null,
		});

		const stealRes = await api('admin/emoji/steal', {
			name: remoteEmojiName,
			host: remoteHost,
			licenseReadText: null,
		}, root);
		assert.strictEqual(stealRes.status, 200);
		const emoji = stealRes.body!;

		// 絵文字用には一般ユーザーのファイルとは別のシステム所有ファイルが作られる
		const emojiDriveFile = await assertSystemOwned(emoji.url);
		assert.notStrictEqual(emojiDriveFile.id, userFile.id);
		assert.notStrictEqual(emoji.url, userFile.url);

		// 一般ユーザーが元々所有していたファイルは削除されず参照可能なまま残る
		const remainingUserFile = await driveFilesRepository.findOneBy({ id: userFile.id });
		assert.ok(remainingUserFile, '一般ユーザーのファイルは削除されない');
		assert.strictEqual(remainingUserFile.userId, otherAdmin.id);
		const userFileFetch = await fetch(userFile.url);
		assert.strictEqual(userFileFetch.status, 200);
	});

	test('copy はリモート絵文字をメタデータ付きでローカルへ取り込む', async () => {
		const remoteEmojiName = 'test_copy_' + Math.random().toString(36).slice(2, 8);
		const remoteHost = 'remote.test';
		const remoteOriginalUrl = `${remoteUrl}/copy.png`;

		// 他テストでアップロード済みのファイルと md5 が衝突しないよう、テスト固有の画像を配信する
		remoteImages.set('copy.png', { type: 'image/png', body: await createSolidPng() });

		const remoteEmoji = {
			id: idService.gen(),
			updatedAt: new Date(),
			name: remoteEmojiName,
			host: remoteHost,
			category: 'copy-category',
			originalUrl: remoteOriginalUrl,
			publicUrl: remoteOriginalUrl,
			uri: remoteOriginalUrl,
			type: 'image/png',
			aliases: ['copy_alias'],
			license: 'copy-license',
			localOnly: false,
			isSensitive: false,
			usageInfo: 'copy usage',
			description: 'copy description',
			author: 'copy author',
			copyPermission: 'allow' as const,
			isBasedOn: 'https://example.com/copy-base',
		};
		await emojisRepository.insert(remoteEmoji);

		const copyRes = await api('admin/emoji/copy', {
			emojiId: remoteEmoji.id,
			licenseReadText: null,
		}, root);
		assert.strictEqual(copyRes.status, 200);
		const emoji = copyRes.body!;

		assert.strictEqual(emoji.host, null);
		assert.strictEqual(emoji.importFrom, remoteHost);
		assert.strictEqual(emoji.category, 'copy-category');
		assert.deepStrictEqual(emoji.aliases, ['copy_alias']);
		assert.strictEqual(emoji.license, 'copy-license');
		assert.strictEqual(emoji.author, 'copy author');
		assert.strictEqual(emoji.description, 'copy description');
		assert.strictEqual(emoji.isBasedOn, 'https://example.com/copy-base');

		await assertSystemOwned(emoji.url);
	});

	test('import-zip は ZIP 内の絵文字をメタデータ付きで取り込む', async () => {
		const prefix = 'test_zip_' + Math.random().toString(36).slice(2, 8);
		const firstName = `${prefix}_a`;
		const secondName = `${prefix}_b`;

		const alphaPath = path.join(tempDir, 'alpha.jpg');
		const betaPath = path.join(tempDir, 'beta.png');
		const metaPath = path.join(tempDir, 'meta.json');
		const zipPath = path.join(tempDir, `${prefix}.zip`);
		await fs.promises.writeFile(alphaPath, jpegBytes);
		await fs.promises.writeFile(betaPath, pngBytes);

		const meta = {
			emojis: [
				{
					fileName: 'alpha.jpg',
					downloaded: true,
					emoji: {
						name: firstName,
						category: 'zip-category-a',
						aliases: ['zip_alias_a'],
						license: 'zip-license-a',
						isSensitive: false,
						localOnly: false,
						author: 'zip author a',
						description: 'zip description a',
						usageInfo: 'zip usage a',
						copyPermission: 'allow',
						isBasedOn: 'https://example.com/zip-a',
					},
				},
				{
					fileName: 'beta.png',
					downloaded: true,
					emoji: {
						name: secondName,
						category: 'zip-category-b',
						aliases: ['zip_alias_b'],
						license: 'zip-license-b',
						isSensitive: false,
						localOnly: false,
						author: 'zip author b',
						description: 'zip description b',
						usageInfo: 'zip usage b',
						copyPermission: 'allow',
						isBasedOn: 'https://example.com/zip-b',
					},
				},
			],
		};
		await fs.promises.writeFile(metaPath, JSON.stringify(meta));

		const archive = await ZipArchive.create(zipPath);
		await archive.addFile('meta.json', metaPath);
		await archive.addFile('alpha.jpg', alphaPath);
		await archive.addFile('beta.png', betaPath);
		await archive.close();

		const zipBlob = new Blob([new Uint8Array(await fs.promises.readFile(zipPath))]);
		const upRes = await uploadFile(root, { blob: zipBlob, name: `${prefix}.zip` });
		assert.strictEqual(upRes.status, 200);
		const zipFile = upRes.body!;

		const importRes = await api('admin/emoji/import-zip', { fileId: zipFile.id }, root);
		assert.strictEqual(importRes.status, 204);

		let imported: misskey.entities.EmojiDetailed[] = [];
		await vi.waitFor(async () => {
			const listRes = await api('admin/emoji/list', { query: prefix, limit: 100 }, root);
			assert.strictEqual(listRes.status, 200);
			imported = listRes.body!.filter((e: misskey.entities.EmojiDetailed) => e.name === firstName || e.name === secondName);
			assert.strictEqual(imported.length, 2);
		}, { timeout: 30000, interval: 1000 });

		const first = imported.find(e => e.name === firstName)!;
		assert.strictEqual(first.category, 'zip-category-a');
		assert.deepStrictEqual(first.aliases, ['zip_alias_a']);
		assert.strictEqual(first.license, 'zip-license-a');
		assert.strictEqual(first.author, 'zip author a');
		assert.strictEqual(first.description, 'zip description a');
		assert.strictEqual(first.usageInfo, 'zip usage a');
		assert.strictEqual(first.copyPermission, 'allow');
		assert.strictEqual(first.isBasedOn, 'https://example.com/zip-a');

		const second = imported.find(e => e.name === secondName)!;
		assert.strictEqual(second.category, 'zip-category-b');
		assert.deepStrictEqual(second.aliases, ['zip_alias_b']);
		assert.strictEqual(second.license, 'zip-license-b');
		assert.strictEqual(second.author, 'zip author b');
		assert.strictEqual(second.description, 'zip description b');
		assert.strictEqual(second.usageInfo, 'zip usage b');
		assert.strictEqual(second.copyPermission, 'allow');
		assert.strictEqual(second.isBasedOn, 'https://example.com/zip-b');

		await assertSystemOwned(first.url);
		await assertSystemOwned(second.url);
	});
});
