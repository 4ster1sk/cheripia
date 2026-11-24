/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, describe, test, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { EmojiEntityService } from '@/core/entities/EmojiEntityService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { IdService } from '@/core/IdService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { DI } from '@/di-symbols.js';
import { GlobalModule } from '@/GlobalModule.js';
import { EmojisRepository, MiDriveFile } from '@/models/_.js';
import { MiEmoji } from '@/models/Emoji.js';
import { CoreModule } from '@/core/CoreModule.js';

describe('CustomEmojiService', () => {
	let app: TestingModule;
	let service: CustomEmojiService;

	let emojisRepository: EmojisRepository;
	let idService: IdService;

	beforeAll(async () => {
		app = await Test
			.createTestingModule({
				imports: [
					GlobalModule,
					CoreModule,
				],
				providers: [
					CustomEmojiService,
					UtilityService,
					IdService,
					EmojiEntityService,
					ModerationLogService,
					GlobalEventService,
				],
			})
			.compile();
		app.enableShutdownHooks();

		service = app.get<CustomEmojiService>(CustomEmojiService);
		emojisRepository = app.get<EmojisRepository>(DI.emojisRepository);
		idService = app.get<IdService>(IdService);
	});

	describe('fetchEmojis', () => {
		async function insert(data: Partial<MiEmoji>[]) {
			for (const d of data) {
				const id = idService.gen();
				await emojisRepository.insert({
					id: id,
					updatedAt: new Date(),
					...d,
				});
			}
		}

		function call(params: Parameters<CustomEmojiService['fetchEmojis']>['0']) {
			return service.fetchEmojis(
				params,
				{
					// テスト向けに
					sortKeys: ['+id'],
				},
			);
		}

		function defaultData(suffix: string, override?: Partial<MiEmoji>): Partial<MiEmoji> {
			return {
				name: `emoji${suffix}`,
				host: null,
				category: 'default',
				originalUrl: `https://example.com/emoji${suffix}.png`,
				publicUrl: `https://example.com/emoji${suffix}.png`,
				type: 'image/png',
				aliases: [`emoji${suffix}`],
				license: 'CC0',
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				...override,
			};
		}

		afterEach(async () => {
			await emojisRepository.createQueryBuilder().delete().execute();
		});

		describe('単独', () => {
			test('updatedAtFrom', async () => {
				await insert([
					defaultData('001', { updatedAt: new Date('2021-01-01T00:00:00.000Z') }),
					defaultData('002', { updatedAt: new Date('2021-01-02T00:00:00.000Z') }),
					defaultData('003', { updatedAt: new Date('2021-01-03T00:00:00.000Z') }),
				]);

				const actual = await call({
					query: {
						updatedAtFrom: '2021-01-02T00:00:00.000Z',
					},
				});

				expect(actual.allCount).toBe(2);
				expect(actual.emojis[0].name).toBe('emoji002');
				expect(actual.emojis[1].name).toBe('emoji003');
			});

			test('updatedAtTo', async () => {
				await insert([
					defaultData('001', { updatedAt: new Date('2021-01-01T00:00:00.000Z') }),
					defaultData('002', { updatedAt: new Date('2021-01-02T00:00:00.000Z') }),
					defaultData('003', { updatedAt: new Date('2021-01-03T00:00:00.000Z') }),
				]);

				const actual = await call({
					query: {
						updatedAtTo: '2021-01-02T00:00:00.000Z',
					},
				});

				expect(actual.allCount).toBe(2);
				expect(actual.emojis[0].name).toBe('emoji001');
				expect(actual.emojis[1].name).toBe('emoji002');
			});

			describe('name', () => {
				test('single', async () => {
					await insert([
						defaultData('001'),
						defaultData('002'),
					]);

					const actual = await call({
						query: {
							name: 'emoji001',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji001');
				});

				test('multi', async () => {
					await insert([
						defaultData('001'),
						defaultData('002'),
					]);

					const actual = await call({
						query: {
							name: 'emoji001 emoji002',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001'),
						defaultData('002'),
						defaultData('003', { name: 'em003' }),
					]);

					const actual = await call({
						query: {
							name: 'oji',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
				});

				test('escape', async () => {
					await insert([
						defaultData('001'),
					]);

					const actual = await call({
						query: {
							name: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('host', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
						defaultData('002', { host: 'example.com' }),
						defaultData('003', { host: '1.example.com' }),
						defaultData('004', { host: '2.example.com' }),
					]);

					const actual = await call({
						query: {
							host: 'example.com',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(4);
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
						defaultData('002', { host: 'example.com' }),
						defaultData('003', { host: '1.example.com' }),
						defaultData('004', { host: '2.example.com' }),
					]);

					const actual = await call({
						query: {
							host: '1.example.com 2.example.com',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji003');
					expect(actual.emojis[1].name).toBe('emoji004');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
						defaultData('002', { host: 'example.com' }),
						defaultData('003', { host: '1.example.com' }),
						defaultData('004', { host: '2.example.com' }),
					]);

					const actual = await call({
						query: {
							host: 'example',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(4);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { host: 'example.com' }),
					]);

					const actual = await call({
						query: {
							host: '%',
							hostType: 'remote',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('uri', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
						defaultData('002', { uri: 'uri002' }),
						defaultData('003', { uri: 'uri003' }),
					]);

					const actual = await call({
						query: {
							uri: 'uri002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
						defaultData('002', { uri: 'uri002' }),
						defaultData('003', { uri: 'uri003' }),
					]);

					const actual = await call({
						query: {
							uri: 'uri001 uri003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
						defaultData('002', { uri: 'uri002' }),
						defaultData('003', { uri: 'uri003' }),
					]);

					const actual = await call({
						query: {
							uri: 'ri',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { uri: 'uri001' }),
					]);

					const actual = await call({
						query: {
							uri: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('publicUrl', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
						defaultData('002', { publicUrl: 'publicUrl002' }),
						defaultData('003', { publicUrl: 'publicUrl003' }),
					]);

					const actual = await call({
						query: {
							publicUrl: 'publicUrl002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
						defaultData('002', { publicUrl: 'publicUrl002' }),
						defaultData('003', { publicUrl: 'publicUrl003' }),
					]);

					const actual = await call({
						query: {
							publicUrl: 'publicUrl001 publicUrl003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
						defaultData('002', { publicUrl: 'publicUrl002' }),
						defaultData('003', { publicUrl: 'publicUrl003' }),
					]);

					const actual = await call({
						query: {
							publicUrl: 'Url',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { publicUrl: 'publicUrl001' }),
					]);

					const actual = await call({
						query: {
							publicUrl: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('type', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
						defaultData('002', { type: 'type002' }),
						defaultData('003', { type: 'type003' }),
					]);

					const actual = await call({
						query: {
							type: 'type002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
						defaultData('002', { type: 'type002' }),
						defaultData('003', { type: 'type003' }),
					]);

					const actual = await call({
						query: {
							type: 'type001 type003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
						defaultData('002', { type: 'type002' }),
						defaultData('003', { type: 'type003' }),
					]);

					const actual = await call({
						query: {
							type: 'pe',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { type: 'type001' }),
					]);

					const actual = await call({
						query: {
							type: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('aliases', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
						defaultData('002', { aliases: ['alias002'] }),
						defaultData('003', { aliases: ['alias003'] }),
					]);

					const actual = await call({
						query: {
							aliases: 'alias002',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
						defaultData('002', { aliases: ['alias002', 'alias004'] }),
						defaultData('003', { aliases: ['alias003'] }),
						defaultData('004', { aliases: ['alias004'] }),
					]);

					const actual = await call({
						query: {
							aliases: 'alias001 alias004',
						},
					});

					expect(actual.allCount).toBe(3);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
					expect(actual.emojis[2].name).toBe('emoji004');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
						defaultData('002', { aliases: ['alias002', 'alias004'] }),
						defaultData('003', { aliases: ['alias003'] }),
						defaultData('004', { aliases: ['alias004'] }),
					]);

					const actual = await call({
						query: {
							aliases: 'ias',
						},
					});

					expect(actual.allCount).toBe(4);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { aliases: ['alias001', 'alias002'] }),
					]);

					const actual = await call({
						query: {
							aliases: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('category', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
						defaultData('002', { category: 'category002' }),
						defaultData('003', { category: 'category003' }),
					]);

					const actual = await call({
						query: {
							category: 'category002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
						defaultData('002', { category: 'category002' }),
						defaultData('003', { category: 'category003' }),
					]);

					const actual = await call({
						query: {
							category: 'category001 category003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
						defaultData('002', { category: 'category002' }),
						defaultData('003', { category: 'category003' }),
					]);

					const actual = await call({
						query: {
							category: 'egory',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { category: 'category001' }),
					]);

					const actual = await call({
						query: {
							category: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('license', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
						defaultData('002', { license: 'license002' }),
						defaultData('003', { license: 'license003' }),
					]);

					const actual = await call({
						query: {
							license: 'license002',
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
						defaultData('002', { license: 'license002' }),
						defaultData('003', { license: 'license003' }),
					]);

					const actual = await call({
						query: {
							license: 'license001 license003',
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('keyword', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
						defaultData('002', { license: 'license002' }),
						defaultData('003', { license: 'license003' }),
					]);

					const actual = await call({
						query: {
							license: 'cense',
						},
					});

					expect(actual.allCount).toBe(3);
				});

				test('escape', async () => {
					await insert([
						defaultData('001', { license: 'license001' }),
					]);

					const actual = await call({
						query: {
							license: '%',
						},
					});

					expect(actual.allCount).toBe(0);
				});
			});

			describe('isSensitive', () => {
				test('true', async () => {
					await insert([
						defaultData('001', { isSensitive: true }),
						defaultData('002', { isSensitive: false }),
						defaultData('003', { isSensitive: true }),
					]);

					const actual = await call({
						query: {
							isSensitive: true,
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('false', async () => {
					await insert([
						defaultData('001', { isSensitive: true }),
						defaultData('002', { isSensitive: false }),
						defaultData('003', { isSensitive: true }),
					]);

					const actual = await call({
						query: {
							isSensitive: false,
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('null', async () => {
					await insert([
						defaultData('001', { isSensitive: true }),
						defaultData('002', { isSensitive: false }),
						defaultData('003', { isSensitive: true }),
					]);

					const actual = await call({
						query: {},
					});

					expect(actual.allCount).toBe(3);
				});
			});

			describe('localOnly', () => {
				test('true', async () => {
					await insert([
						defaultData('001', { localOnly: true }),
						defaultData('002', { localOnly: false }),
						defaultData('003', { localOnly: true }),
					]);

					const actual = await call({
						query: {
							localOnly: true,
						},
					});

					expect(actual.allCount).toBe(2);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji003');
				});

				test('false', async () => {
					await insert([
						defaultData('001', { localOnly: true }),
						defaultData('002', { localOnly: false }),
						defaultData('003', { localOnly: true }),
					]);

					const actual = await call({
						query: {
							localOnly: false,
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('null', async () => {
					await insert([
						defaultData('001', { localOnly: true }),
						defaultData('002', { localOnly: false }),
						defaultData('003', { localOnly: true }),
					]);

					const actual = await call({
						query: {},
					});

					expect(actual.allCount).toBe(3);
				});
			});

			describe('roleId', () => {
				test('single', async () => {
					await insert([
						defaultData('001', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role001'] }),
						defaultData('002', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role002'] }),
						defaultData('003', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role003'] }),
					]);

					const actual = await call({
						query: {
							roleIds: ['role002'],
						},
					});

					expect(actual.allCount).toBe(1);
					expect(actual.emojis[0].name).toBe('emoji002');
				});

				test('multi', async () => {
					await insert([
						defaultData('001', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role001'] }),
						defaultData('002', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role002', 'role003'] }),
						defaultData('003', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role003'] }),
						defaultData('004', { roleIdsThatCanBeUsedThisEmojiAsReaction: ['role004'] }),
					]);

					const actual = await call({
						query: {
							roleIds: ['role001', 'role003'],
						},
					});

					expect(actual.allCount).toBe(3);
					expect(actual.emojis[0].name).toBe('emoji001');
					expect(actual.emojis[1].name).toBe('emoji002');
					expect(actual.emojis[2].name).toBe('emoji003');
				});
			});
		});
	});

	describe('URL ルックアップの回帰テスト', () => {
		type AddData = Parameters<CustomEmojiService['add']>[0];

		function createService() {
			const emojisRepository = {
				exists: vi.fn(),
				findOneBy: vi.fn(),
				find: vi.fn().mockResolvedValue([]),
				insertOne: vi.fn(async (value: any) => value),
				update: vi.fn(),
			};
			const driveFilesRepository = {
				findOneBy: vi.fn(),
				existsBy: vi.fn(),
			};
			const driveService = {
				uploadFromUrl: vi.fn(),
				reuploadFile: vi.fn(),
				deleteFile: vi.fn(),
			};
			const redisClient = {
				get: vi.fn().mockResolvedValue(null),
				set: vi.fn().mockResolvedValue('OK'),
				del: vi.fn().mockResolvedValue(1),
			};
			const emojiEntityService = {
				packDetailed: vi.fn().mockResolvedValue({}),
			};
			const globalEventService = {
				publishBroadcastStream: vi.fn(),
			};
			const moderationLogService = {
				log: vi.fn(),
			};
			const logger = {
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};

			const service = new CustomEmojiService(
				{} as any,
				redisClient as any,
				emojisRepository as any,
				driveFilesRepository as any,
				{} as any,
				{ gen: vi.fn(() => 'newEmojiId') } as any,
				emojiEntityService as any,
				moderationLogService as any,
				globalEventService as any,
				driveService as any,
				{ getLogger: vi.fn(() => logger) } as any,
			);

			return { service, emojisRepository, driveFilesRepository, driveService };
		}

		function createEmoji(overrides: Partial<MiEmoji> = {}): MiEmoji {
			return {
				id: 'emojiId',
				updatedAt: new Date(),
				name: 'emoji',
				host: null,
				category: null,
				originalUrl: 'https://example.com/emoji.png',
				publicUrl: 'https://example.com/emoji.png',
				uri: null,
				type: 'image/png',
				aliases: [],
				license: null,
				localOnly: false,
				isSensitive: false,
				usageInfo: null,
				description: null,
				author: null,
				copyPermission: null,
				isBasedOn: null,
				importFrom: null,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				...overrides,
			};
		}

		function createDriveFile(overrides: Partial<MiDriveFile> = {}): MiDriveFile {
			return {
				id: 'driveFileId',
				userId: null,
				userHost: null,
				md5: 'd41d8cd98f00b204e9800998ecf8427e',
				url: 'https://example.com/drive.png',
				webpublicUrl: null,
				type: 'image/png',
				webpublicType: null,
				...overrides,
			} as MiDriveFile;
		}

		function createAddData(overrides: Partial<AddData> = {}): AddData {
			return {
				originalUrl: 'https://example.com/emoji.png',
				publicUrl: 'https://example.com/emoji.png',
				fileType: 'image/png',
				name: 'emoji',
				category: null,
				aliases: [],
				host: null,
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				copyPermission: null,
				usageInfo: null,
				author: null,
				description: null,
				isBasedOn: null,
				...overrides,
			};
		}

		test('importEmoji はアップロード済みのシステム所有ファイルを再コピーしない', async () => {
			const { service, emojisRepository, driveFilesRepository, driveService } = createService();
			const uploadedFile = createDriveFile({
				id: 'uploadedFileId',
				url: 'https://example.com/uploaded.png',
				userId: null,
				userHost: null,
			});
			const remoteEmoji = createEmoji({
				id: 'remoteEmojiId',
				name: 'remoteEmoji',
				host: 'remote.test',
				originalUrl: 'https://remote.test/emoji.png',
				copyPermission: 'allow',
			});

			emojisRepository.findOneBy.mockResolvedValue(remoteEmoji);
			emojisRepository.exists.mockResolvedValue(false);
			driveService.uploadFromUrl.mockResolvedValue(uploadedFile);

			const emoji = await service.importEmoji({ id: remoteEmoji.id, licenseReadText: null }, {} as any);

			expect(emoji.originalUrl).toBe(uploadedFile.url);
			expect(driveService.uploadFromUrl).toHaveBeenCalledWith({
				url: remoteEmoji.originalUrl,
				user: null,
				force: true,
			});
			expect(driveService.reuploadFile).not.toHaveBeenCalled();
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveFilesRepository.existsBy).not.toHaveBeenCalled();
			expect(driveService.deleteFile).not.toHaveBeenCalled();
		});

		test('add は渡された元ファイルを使って再アップロードし、URL で検索しない', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const originalFile = createDriveFile({
				id: 'originalFileId',
				md5: '0123456789abcdef0123456789abcdef',
				url: 'https://example.com/original.png',
				userId: 'userId',
				userHost: null,
			});
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});

			driveService.reuploadFile.mockResolvedValue(copiedFile);
			driveFilesRepository.existsBy.mockResolvedValue(false);

			const emoji = await service.add(createAddData({
				originalUrl: originalFile.url,
				driveFile: originalFile,
			}));

			expect(emoji.originalUrl).toBe(copiedFile.url);
			expect(driveService.reuploadFile).toHaveBeenCalledWith(expect.objectContaining({
				originalUrl: originalFile.url,
				originalDriveFile: originalFile,
			}));
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveFilesRepository.existsBy).toHaveBeenCalledTimes(1);
			expect(driveFilesRepository.existsBy.mock.calls[0][0].md5).toBe(originalFile.md5);
			expect(driveFilesRepository.existsBy.mock.calls[0][0].url).toBe(originalFile.url);
			expect(driveFilesRepository.existsBy.mock.calls[0][0].id.type).toBe('not');
			expect(driveFilesRepository.existsBy.mock.calls[0][0].id.value).toBe(originalFile.id);
			expect(driveService.deleteFile).toHaveBeenCalledWith(originalFile);
		});

		test('add は同じ md5 と URL を参照する別ファイルがある場合は元ファイルを削除しない', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const originalFile = createDriveFile({
				id: 'originalFileId',
				md5: '0123456789abcdef0123456789abcdef',
				url: 'https://example.com/original.png',
				userId: 'userId',
				userHost: null,
			});
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});

			driveService.reuploadFile.mockResolvedValue(copiedFile);
			driveFilesRepository.existsBy.mockResolvedValue(true);

			await service.add(createAddData({
				originalUrl: originalFile.url,
				driveFile: originalFile,
			}));

			expect(driveFilesRepository.existsBy).toHaveBeenCalledTimes(1);
			expect(driveService.deleteFile).not.toHaveBeenCalled();
		});

		test('add は reuseDriveFile が true のシステム所有ファイルをそのまま利用する', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const driveFile = createDriveFile({
				id: 'systemFileId',
				url: 'https://example.com/system.png',
				userId: null,
				userHost: null,
			});

			const emoji = await service.add(createAddData({
				originalUrl: driveFile.url,
				driveFile,
				reuseDriveFile: true,
			}));

			expect(emoji.originalUrl).toBe(driveFile.url);
			expect(driveService.reuploadFile).not.toHaveBeenCalled();
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveFilesRepository.existsBy).not.toHaveBeenCalled();
			expect(driveService.deleteFile).not.toHaveBeenCalled();
		});

		test('add は reuseDriveFile が true でもユーザー所有ファイルは再アップロードする', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const originalFile = createDriveFile({
				id: 'userFileId',
				url: 'https://example.com/user.png',
				userId: 'userId',
				userHost: null,
			});
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});

			driveService.reuploadFile.mockResolvedValue(copiedFile);
			driveFilesRepository.existsBy.mockResolvedValue(false);

			await service.add(createAddData({
				originalUrl: originalFile.url,
				driveFile: originalFile,
				reuseDriveFile: true,
			}));

			expect(driveService.reuploadFile).toHaveBeenCalledWith(expect.objectContaining({
				originalDriveFile: originalFile,
			}));
			expect(driveService.deleteFile).toHaveBeenCalledWith(originalFile);
		});

		test('add は reuseDriveFile が true でもリモート所有ファイルは再アップロードする', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const originalFile = createDriveFile({
				id: 'remoteFileId',
				url: 'https://remote.test/file.png',
				userId: null,
				userHost: 'remote.test',
			});
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});

			driveService.reuploadFile.mockResolvedValue(copiedFile);
			driveFilesRepository.existsBy.mockResolvedValue(false);

			await service.add(createAddData({
				originalUrl: originalFile.url,
				driveFile: originalFile,
				reuseDriveFile: true,
			}));

			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveService.reuploadFile).toHaveBeenCalledWith(expect.objectContaining({
				originalUrl: originalFile.url,
				originalDriveFile: originalFile,
			}));
		});

		test('add は reuseDriveFile が true でも driveFile が null なら URL 検索せず再アップロードする', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});

			driveService.reuploadFile.mockResolvedValue(copiedFile);

			await service.add(createAddData({
				originalUrl: 'https://example.com/missing.png',
				driveFile: null,
				reuseDriveFile: true,
			}));

			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveService.reuploadFile).toHaveBeenCalledWith({
				originalUrl: 'https://example.com/missing.png',
				originalDriveFile: null,
			});
			expect(driveFilesRepository.existsBy).not.toHaveBeenCalled();
			expect(driveService.deleteFile).not.toHaveBeenCalled();
		});

		test('update は渡された元ファイルを使って再アップロードし、URL で検索しない', async () => {
			const { service, emojisRepository, driveFilesRepository, driveService } = createService();
			const existingEmoji = createEmoji({
				id: 'emojiId',
				name: 'emoji',
				originalUrl: 'https://example.com/old.png',
			});
			const newFile = createDriveFile({
				id: 'newFileId',
				md5: 'fedcba9876543210fedcba9876543210',
				url: 'https://example.com/new.png',
				userId: 'userId',
				userHost: null,
			});
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});

			emojisRepository.findOneBy.mockResolvedValue(existingEmoji);
			driveService.reuploadFile.mockResolvedValue(copiedFile);
			driveFilesRepository.existsBy.mockResolvedValue(false);

			const error = await service.update({
				id: existingEmoji.id,
				originalUrl: newFile.url,
				publicUrl: newFile.url,
				fileType: newFile.type,
				driveFile: newFile,
			});

			expect(error).toBeNull();
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveService.reuploadFile).toHaveBeenCalledWith({
				originalUrl: newFile.url,
				originalDriveFile: newFile,
			});
			expect(driveFilesRepository.existsBy).toHaveBeenCalledTimes(1);
			expect(driveFilesRepository.existsBy.mock.calls[0][0].md5).toBe(newFile.md5);
			expect(driveFilesRepository.existsBy.mock.calls[0][0].url).toBe(newFile.url);
			expect(driveService.deleteFile).toHaveBeenCalledWith(newFile);
			expect(emojisRepository.update).toHaveBeenCalledWith(existingEmoji.id, expect.objectContaining({
				originalUrl: copiedFile.url,
				publicUrl: copiedFile.url,
				type: copiedFile.type,
			}));
		});

		test('update はファイル変更がない場合は再アップロードも URL 検索もしない', async () => {
			const { service, emojisRepository, driveFilesRepository, driveService } = createService();
			const existingEmoji = createEmoji({
				id: 'emojiId',
				name: 'emoji',
				originalUrl: 'https://example.com/same.png',
			});

			emojisRepository.findOneBy.mockResolvedValue(existingEmoji);

			const errorWithoutUrl = await service.update({
				id: existingEmoji.id,
				category: 'updated-category',
			});
			const errorWithSameUrl = await service.update({
				id: existingEmoji.id,
				originalUrl: existingEmoji.originalUrl,
			});

			expect(errorWithoutUrl).toBeNull();
			expect(errorWithSameUrl).toBeNull();
			expect(driveService.reuploadFile).not.toHaveBeenCalled();
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveFilesRepository.existsBy).not.toHaveBeenCalled();
			expect(driveService.deleteFile).not.toHaveBeenCalled();
		});

		test('reuploadFileAndCleanup は originalDriveFile が null なら URL 検索しない', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});
			driveService.reuploadFile.mockResolvedValue(copiedFile);

			const result = await service.reuploadFileAndCleanup({
				originalUrl: 'https://example.com/missing.png',
				originalDriveFile: null,
			});

			expect(result).toBe(copiedFile);
			expect(driveFilesRepository.findOneBy).not.toHaveBeenCalled();
			expect(driveService.reuploadFile).toHaveBeenCalledWith({
				originalUrl: 'https://example.com/missing.png',
				originalDriveFile: null,
			});
			expect(driveFilesRepository.existsBy).not.toHaveBeenCalled();
			expect(driveService.deleteFile).not.toHaveBeenCalled();
		});

		test('reuploadFileAndCleanup は originalDriveFile 未指定なら URL を1回だけ検索する', async () => {
			const { service, driveFilesRepository, driveService } = createService();
			const originalFile = createDriveFile({
				id: 'originalFileId',
				url: 'https://example.com/original.png',
				userId: 'userId',
				userHost: null,
			});
			const copiedFile = createDriveFile({
				id: 'copiedFileId',
				url: 'https://example.com/copied.png',
				userId: null,
				userHost: null,
			});
			driveFilesRepository.findOneBy.mockResolvedValue(originalFile);
			driveFilesRepository.existsBy.mockResolvedValue(false);
			driveService.reuploadFile.mockResolvedValue(copiedFile);

			await service.reuploadFileAndCleanup({ originalUrl: originalFile.url });

			expect(driveFilesRepository.findOneBy).toHaveBeenCalledTimes(1);
			expect(driveFilesRepository.findOneBy).toHaveBeenCalledWith({ url: originalFile.url });
			expect(driveService.reuploadFile).toHaveBeenCalledWith(expect.objectContaining({
				originalDriveFile: originalFile,
			}));
			expect(driveService.deleteFile).toHaveBeenCalledWith(originalFile);
		});
	});
});
