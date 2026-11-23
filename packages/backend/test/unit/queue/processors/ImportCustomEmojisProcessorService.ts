/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { describe, test, expect, vi } from 'vitest';
import { IsNull } from 'typeorm';
import { ImportCustomEmojisProcessorService } from '@/queue/processors/ImportCustomEmojisProcessorService.js';
import type { MiDriveFile } from '@/models/DriveFile.js';

describe('ImportCustomEmojisProcessorService', () => {
	function createService() {
		const driveFilesRepository = { findOneBy: vi.fn() };
		const emojisRepository = { delete: vi.fn().mockResolvedValue({}) };
		const customEmojiService = { add: vi.fn().mockResolvedValue({}) };
		const driveService = { addFile: vi.fn() };
		const downloadService = { downloadUrl: vi.fn() };
		const logger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			succ: vi.fn(),
		};

		const service = new ImportCustomEmojisProcessorService(
			driveFilesRepository as any,
			emojisRepository as any,
			customEmojiService as any,
			driveService as any,
			downloadService as any,
			{ logger: { createSubLogger: vi.fn(() => logger) } } as any,
		);

		return { service, emojisRepository, customEmojiService, driveService };
	}

	test('importEmoji はアップロードしたファイルを再利用する', async () => {
		const { service, emojisRepository, customEmojiService, driveService } = createService();
		const emojiPath = '/tmp/imported-emoji.png';
		const driveFile = {
			id: 'driveFileId',
			url: 'https://example.com/drive.png',
			webpublicUrl: null,
			type: 'image/png',
			webpublicType: null,
		} as MiDriveFile;
		driveService.addFile.mockResolvedValue(driveFile);

		const record = {
			fileName: 'emoji.png',
			downloaded: true,
			emoji: {
				name: 'test_emoji',
				category: 'test-category',
				aliases: ['alias'],
				license: 'CC0',
				isSensitive: true,
				localOnly: false,
				author: 'test author',
				description: 'test description',
				usageInfo: 'test usage',
				copyPermission: 'allow' as const,
				isBasedOn: 'https://example.com/based-on',
			},
		};

		await (service as any).importEmoji(record, emojiPath);

		expect(emojisRepository.delete).toHaveBeenCalledWith({
			name: 'test_emoji',
			host: IsNull(),
		});
		expect(driveService.addFile).toHaveBeenCalledWith({
			user: null,
			path: emojiPath,
			name: 'emoji.png',
			force: true,
		});
		expect(customEmojiService.add).toHaveBeenCalledWith(expect.objectContaining({
			originalUrl: driveFile.url,
			publicUrl: driveFile.url,
			fileType: driveFile.type,
			name: 'test_emoji',
			category: 'test-category',
			host: null,
			aliases: ['alias'],
			license: 'CC0',
			isSensitive: true,
			localOnly: false,
			author: 'test author',
			description: 'test description',
			usageInfo: 'test usage',
			copyPermission: 'allow',
			isBasedOn: 'https://example.com/based-on',
			roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			driveFile,
			reuseDriveFile: true,
		}));
	});
});
