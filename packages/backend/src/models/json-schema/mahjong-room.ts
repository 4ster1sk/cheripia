/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedMahjongRoomDetailedSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
			format: 'id',
		},
		createdAt: {
			type: 'string',
			optional: false, nullable: false,
			format: 'date-time',
		},
		startedAt: {
			type: 'string',
			optional: false, nullable: true,
			format: 'date-time',
		},
		endedAt: {
			type: 'string',
			optional: false, nullable: true,
			format: 'date-time',
		},
		isStarted: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		isEnded: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user1Id: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		user2Id: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		user3Id: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		user4Id: {
			type: 'string',
			optional: false, nullable: true,
			format: 'id',
		},
		user1: {
			type: 'object',
			optional: false, nullable: true,
			ref: 'UserLite',
		},
		user2: {
			type: 'object',
			optional: false, nullable: true,
			ref: 'UserLite',
		},
		user3: {
			type: 'object',
			optional: false, nullable: true,
			ref: 'UserLite',
		},
		user4: {
			type: 'object',
			optional: false, nullable: true,
			ref: 'UserLite',
		},
		user1Ai: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user2Ai: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user3Ai: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user4Ai: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user1Ready: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user2Ready: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user3Ready: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		user4Ready: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		timeLimitForEachTurn: {
			type: 'number',
			optional: false, nullable: false,
		},
		matchLength: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['east', 'south'],
		},
		gameState: {
			type: 'object',
			optional: false, nullable: true,
			additionalProperties: true,
		},
	},
} as const;
