/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
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
import { MiDriveFile } from '@/models/DriveFile.js';

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

	describe('reuploadFile', () => {
		function createService() {
			const driveFilesRepository = {
				findOneBy: vi.fn(),
			};
			const registerLogger = {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};
			// コンストラクタの依存は reuploadFile では使わないため、空のオブジェクトで埋める
			const service = Reflect.construct(DriveService, Array.from({ length: 25 }, () => ({}))) as DriveService;
			(service as unknown as {
				driveFilesRepository: typeof driveFilesRepository;
				registerLogger: typeof registerLogger;
			}).driveFilesRepository = driveFilesRepository;
			(service as unknown as { registerLogger: typeof registerLogger }).registerLogger = registerLogger;
			return { service, driveFilesRepository, registerLogger };
		}

		function createDriveFile(overrides: Partial<MiDriveFile> = {}): MiDriveFile {
			return {
				id: 'driveFileId',
				userId: null,
				userHost: null,
				url: 'https://example.com/file.png',
				accessKey: 'accessKey',
				storedInternal: true,
				isLink: false,
				thumbnailUrl: null,
				webpublicUrl: null,
				name: 'file.png',
				type: 'image/png',
				...overrides,
			} as MiDriveFile;
		}

		test('originalDriveFile が渡された場合は URL 検索せずコピーする', async () => {
			const { service, driveFilesRepository } = createService();
			const originalFile = createDriveFile({ id: 'originalFileId', url: 'https://example.com/original.png' });
			const copiedFile = createDriveFile({ id: 'copiedFileId', url: 'https://example.com/copied.png' });
			const copy = vi.spyOn(service, 'copy').mockResolvedValue(copiedFile);

			const result = await service.reuploadFile({
				originalUrl: originalFile.url,
				originalDriveFile: originalFile,
			});

			expect(result).toBe(copiedFile);
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(copy).toHaveBeenCalledWith(expect.objectContaining({
				file: originalFile,
				userId: null,
				userHost: null,
			}));
		});

		test('originalDriveFile が無い場合は URL から検索してコピーする', async () => {
			const { service, driveFilesRepository } = createService();
			const originalFile = createDriveFile({ id: 'originalFileId', url: 'https://example.com/original.png' });
			const copiedFile = createDriveFile({ id: 'copiedFileId', url: 'https://example.com/copied.png' });
			const copy = vi.spyOn(service, 'copy').mockResolvedValue(copiedFile);
			driveFilesRepository.findOneBy.mockResolvedValue(originalFile);

			const result = await service.reuploadFile({ originalUrl: originalFile.url });

			expect(result).toBe(copiedFile);
			expect(driveFilesRepository.findOneBy).toHaveBeenCalledWith({ url: originalFile.url });
			expect(copy).toHaveBeenCalledWith(expect.objectContaining({ file: originalFile }));
		});

		test('originalDriveFile が null の場合は URL 検索せずダウンロードする', async () => {
			const { service, driveFilesRepository } = createService();
			const uploadedFile = createDriveFile({ id: 'uploadedFileId', url: 'https://example.com/uploaded.png' });
			const copy = vi.spyOn(service, 'copy');
			const uploadFromUrl = vi.spyOn(service, 'uploadFromUrl').mockResolvedValue(uploadedFile);

			const result = await service.reuploadFile({
				originalUrl: 'https://example.com/missing.png',
				originalDriveFile: null,
			});

			expect(result).toBe(uploadedFile);
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(copy).not.toHaveBeenCalled();
			expect(uploadFromUrl).toHaveBeenCalledWith({
				url: 'https://example.com/missing.png',
				user: null,
				force: true,
			});
		});

		test('originalDriveFile がリモート所有の場合は URL 検索もコピーもせずダウンロードする', async () => {
			const { service, driveFilesRepository } = createService();
			const remoteFile = createDriveFile({
				id: 'remoteFileId',
				url: 'https://remote.test/file.png',
				userId: 'remoteUserId',
				userHost: 'remote.test',
			});
			const uploadedFile = createDriveFile({ id: 'uploadedFileId', url: 'https://example.com/uploaded.png' });
			const copy = vi.spyOn(service, 'copy');
			const uploadFromUrl = vi.spyOn(service, 'uploadFromUrl').mockResolvedValue(uploadedFile);

			const result = await service.reuploadFile({
				originalUrl: remoteFile.url,
				originalDriveFile: remoteFile,
			});

			expect(result).toBe(uploadedFile);
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(copy).not.toHaveBeenCalled();
			expect(uploadFromUrl).toHaveBeenCalledWith({
				url: remoteFile.url,
				user: null,
				force: true,
			});
		});

		test('copy が失敗した場合は警告ログを出してダウンロードへフォールバックする', async () => {
			const { service, driveFilesRepository, registerLogger } = createService();
			const originalFile = createDriveFile({ id: 'originalFileId', url: 'https://example.com/original.png' });
			const uploadedFile = createDriveFile({ id: 'uploadedFileId', url: 'https://example.com/uploaded.png' });
			const copy = vi.spyOn(service, 'copy').mockRejectedValue(new Error('copy failed'));
			const uploadFromUrl = vi.spyOn(service, 'uploadFromUrl').mockResolvedValue(uploadedFile);

			const result = await service.reuploadFile({
				originalUrl: originalFile.url,
				originalDriveFile: originalFile,
			});

			expect(result).toBe(uploadedFile);
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(copy).toHaveBeenCalledTimes(1);
			expect(registerLogger.warn).toHaveBeenCalledTimes(1);
			expect(uploadFromUrl).toHaveBeenCalledWith({
				url: originalFile.url,
				user: null,
				force: true,
			});
		});
	});
});
