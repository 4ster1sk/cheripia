/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MahjongService } from '@/core/MahjongService.js';

export const meta = {
	requireCredential: true,

	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: { ref: 'MahjongRoomDetailed' },
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private mahjongService: MahjongService,
	) {
		super(meta, paramDef, async (_ps, _me) => {
			const rooms = await this.mahjongService.getActiveRooms();
			return await Promise.all(rooms.map(room => this.mahjongService.packRoomSummary(room)));
		});
	}
}
