/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { BubbleGameRecordsRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['bubble-game'],
	allowGet: true,
	cacheSec: 60,

	errors: {
		signinRequired: {
			message: 'Signin required.',
			code: 'SIGNIN_REQUIRED',
			id: 'e2e92334-9e26-41ab-a7b4-1af2c554b1cb',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				id: {
					type: 'string', format: 'misskey:id',
					optional: false, nullable: false,
				},
				score: {
					type: 'integer',
					optional: false, nullable: false,
				},
				user: {
					type: 'object',
					optional: true, nullable: false,
					ref: 'UserLite',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		gameMode: { type: 'string' },
		scope: { type: 'string', enum: ['all', 'following'], default: 'all' },
	},
	required: ['gameMode'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.bubbleGameRecordsRepository)
		private bubbleGameRecordsRepository: BubbleGameRecordsRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.scope === 'following' && me == null) {
				throw new ApiError(meta.errors.signinRequired);
			}

			const query = this.bubbleGameRecordsRepository.createQueryBuilder('record')
				.where('record.gameMode = :gameMode', { gameMode: ps.gameMode })
				.andWhere('record.seededAt > :since', {
					since: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
				})
				.innerJoinAndSelect('record.user', 'user')
				.orderBy('record.score', 'DESC')
				.take(10);

			if (ps.scope === 'following' && me != null) {
				query.setParameter('meId', me.id);
				query.andWhere(qb => {
					const sub = qb.subQuery()
						.select('1')
						.from('following', 'following')
						.where('following.followerId = :meId')
						.andWhere('following.followeeId = record.userId')
						.getQuery();
					return `(record.userId = :meId OR EXISTS ${sub})`;
				});
			}

			const records = await query.getMany();

			const users = await this.userEntityService.packMany(records.map(r => r.user!), me);

			return records.map(r => ({
				id: r.id,
				score: r.score,
				user: users.find(u => u.id === r.user!.id),
			}));
		});
	}
}
