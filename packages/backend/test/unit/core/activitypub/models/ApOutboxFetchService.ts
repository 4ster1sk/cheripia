/*
 * SPDX-FileCopyrightText: syuilo and misskey-project, cheripia team
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { ApOutboxFetchService } from '@/core/activitypub/models/ApOutboxFetchService.js';

describe('ApOutboxFetchService', () => {
	function createService() {
		const remoteUser = {
			id: 'remote-user-1',
			host: 'remote.example',
			uri: 'https://remote.example/users/alice',
			outbox: 'https://remote.example/users/alice/outbox',
			channelId: null,
		};

		const usersRepository = {
			findOneBy: vi.fn().mockResolvedValue(remoteUser),
		};
		const channelsRepository = {
			findOneBy: vi.fn().mockResolvedValue(null),
		};
		const redisClient = {
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue('OK'),
			eval: vi.fn().mockResolvedValue(1),
		};
		const apAudienceService = {
			parseAudience: vi.fn().mockResolvedValue({
				visibility: 'public',
				visibleUsers: [],
				mentionedUsers: [],
			}),
		};
		const apDbResolverService = {};
		const noteCreateService = {
			create: vi.fn().mockResolvedValue(undefined),
		};
		const noteEntityService = {
			isVisibleForMe: vi.fn().mockResolvedValue(true),
		};

		const utilityService = {
			isBlockedHost: vi.fn().mockReturnValue(false),
			toPuny: vi.fn((host: string) => host),
		};
		const idService = {
			parse: vi.fn().mockReturnValue({ date: new Date('2026-01-01T00:00:00.000Z') }),
		};
		const metaService = {
			fetch: vi.fn().mockResolvedValue({ blockedHosts: [] }),
		};
		const apNoteService = {
			fetchNote: vi.fn(),
			createNote: vi.fn(),
		};
		const apLoggerService = {
			logger: {
				info: vi.fn(),
				succ: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			},
		};
		const resolver = {
			resolveOrderedCollection: vi.fn(),
			resolveOrderedCollectionPage: vi.fn(),
		};
		const apResolverService = {
			createResolver: vi.fn().mockResolvedValue(resolver),
		};

		const moduleMap: Record<string, unknown> = {
			UtilityService: utilityService,
			IdService: idService,
			MetaService: metaService,
			ApResolverService: apResolverService,
			ApNoteService: apNoteService,
			ApLoggerService: apLoggerService,
		};
		const moduleRef = {
			get: vi.fn((key: string) => moduleMap[key]),
		};

		const service = new ApOutboxFetchService(
			moduleRef as any,
			usersRepository as any,
			channelsRepository as any,
			redisClient as any,
			apAudienceService as any,
			apDbResolverService as any,
			noteCreateService as any,
			noteEntityService as any,
		);
		service.onModuleInit();

		return {
			service,
			remoteUser,
			resolver,
			apNoteService,
			noteCreateService,
			noteEntityService,
		};
	}

	test('Announce: ローカルの localOnly ノートはリノートとして取り込まない', async () => {
		const { service, remoteUser, resolver, apNoteService, noteCreateService } = createService();

		const announceActivity = {
			id: 'https://remote.example/activities/announce-1',
			type: 'Announce',
			actor: remoteUser.uri,
			object: 'https://local.example/notes/local-only-1',
			published: '2026-01-02T00:00:00.000Z',
		};
		resolver.resolveOrderedCollection.mockResolvedValue({
			first: {
				partOf: remoteUser.outbox,
				orderedItems: [announceActivity],
			},
		});
		apNoteService.fetchNote.mockImplementation(async (target: string) => {
			if (target === announceActivity.id) return null;
			return {
				id: 'local-only-1',
				userHost: null,
				localOnly: true,
				visibility: 'public',
			};
		});

		await service.fetchOutbox(remoteUser.id);

		expect(noteCreateService.create).not.toHaveBeenCalled();
	});

	test('Announce: ローカルの公開 (localOnly=false) ノートはリノートとして取り込む', async () => {
		const { service, remoteUser, resolver, apNoteService, noteCreateService } = createService();

		const announceActivity = {
			id: 'https://remote.example/activities/announce-2',
			type: 'Announce',
			actor: remoteUser.uri,
			object: 'https://local.example/notes/public-1',
			published: '2026-01-02T00:00:00.000Z',
		};
		const publicNote = {
			id: 'public-1',
			userHost: null,
			localOnly: false,
			visibility: 'public',
		};
		resolver.resolveOrderedCollection.mockResolvedValue({
			first: {
				partOf: remoteUser.outbox,
				orderedItems: [announceActivity],
			},
		});
		apNoteService.fetchNote.mockImplementation(async (target: string) => {
			if (target === announceActivity.id) return null;
			return publicNote;
		});

		await service.fetchOutbox(remoteUser.id);

		expect(noteCreateService.create).toHaveBeenCalledTimes(1);
		expect(noteCreateService.create).toHaveBeenCalledWith(
			remoteUser,
			expect.objectContaining({
				renote: publicNote,
				uri: announceActivity.id,
			}),
			true,
		);
	});
});
