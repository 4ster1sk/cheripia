/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FindOperator, type FindOptionsWhere } from 'typeorm';
import {
	DeleteObjectCommand,
	DeleteObjectCommandOutput,
	InvalidObjectState,
	NoSuchKey,
	S3Client,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import type { TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { DriveService } from '@/core/DriveService.js';
import { CoreModule } from '@/core/CoreModule.js';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';

describe('DriveService', () => {
	let app: TestingModule;
	let driveService: DriveService;
	const s3Mock = mockClient(S3Client);

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
			providers: [DriveService],
		}).compile();
		app.enableShutdownHooks();
		driveService = app.get<DriveService>(DriveService);
	});

	beforeEach(async () => {
		s3Mock.reset();
	});

	afterAll(async () => {
		await app.close();
	});

	describe('Object storage', () => {
		test('delete a file', async () => {
			s3Mock.on(DeleteObjectCommand)
				.resolves({} as DeleteObjectCommandOutput);

			await driveService.deleteObjectStorageFile('peace of the world');
		});

		test('delete a file then unexpected error', async () => {
			s3Mock.on(DeleteObjectCommand)
				.rejects(new InvalidObjectState({ $metadata: {}, message: '' }));

			await expect(driveService.deleteObjectStorageFile('unexpected')).rejects.toThrow(Error);
		});

		test('delete a file with no valid key', async () => {
			// Some S3 implementations returns 404 Not Found on deleting with a non-existent key
			s3Mock.on(DeleteObjectCommand)
				.rejects(new NoSuchKey({ $metadata: {}, message: 'allowed error.' }));

			await driveService.deleteObjectStorageFile('lol no way');
		});
	});

	describe('addFile md5 deduplication', () => {
		// Cheripia: user が null のときの md5 重複排除は、システム所有(userId IS NULL)ファイル
		// 内でのみ行われなければならない。条件値に undefined を渡すと TypeORM が userId 条件自体を
		// 無視して全ユーザー横断でマッチしてしまい、他ユーザーのプライベートなファイルが
		// ローカル絵文字の import 等経由で公開される恐れがある。
		test('user が null のときは userId IS NULL 条件で検索し、null 所有の既存ファイルを返す', async () => {
			const bytes = Buffer.from(`cheripia dedup test ${Math.random()}`);
			const md5 = crypto.createHash('md5').update(bytes).digest('hex');
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheripia-drive-dedup-test-'));
			const filePath = path.join(dir, 'dedup.bin');
			fs.writeFileSync(filePath, bytes);

			const matchedStub = {
				id: 'xxxxxxxxxxxxxxxxxxxxxxxx',
				md5,
				userId: null,
				userHost: null,
				url: 'https://example.com/matched',
				webpublicUrl: null,
				thumbnailUrl: null,
				accessKey: 'dedup-test-key',
				storedInternal: false,
				isSensitive: false,
			} as unknown as MiDriveFile;

			const driveFilesRepository = app.get<DriveFilesRepository>(DI.driveFilesRepository);
			const findOneBySpy = vi.spyOn(driveFilesRepository, 'findOneBy').mockResolvedValue(matchedStub);

			try {
				const result = await driveService.addFile({ user: null, path: filePath });

				const dedupQueries = findOneBySpy.mock.calls.filter(([query]) => 'md5' in query && query.md5 === md5);
				expect(dedupQueries).toHaveLength(1);
				const query = dedupQueries[0][0] as FindOptionsWhere<MiDriveFile>;
				expect(query.userId).toBeInstanceOf(FindOperator);
				expect((query.userId as FindOperator<unknown>).type).toBe('isNull');
				// 重複排除が命中したら新規登録されず既存ファイルがそのまま返される
				expect(result.id).toBe(matchedStub.id);
			} finally {
				findOneBySpy.mockRestore();
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});
	});
});
