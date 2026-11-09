import {
	Antenna,
	ChatMessage,
	ChatMessageLite,
	DriveFile,
	DriveFolder,
	Note,
	Notification,
	Signin,
	User,
	UserGroup,
	UserDetailed,
	UserDetailedNotMe,
	UserLite,
	MahjongRoomDetailed,
} from './autogen/models.js';
import {
	AnnouncementCreated,
	AnnouncementReacted,
	AnnouncementUnreacted,
	EmojiAdded, EmojiDeleted,
	EmojiUpdated,
	PageEvent,
	QueueStats,
	QueueStatsLog,
	ServerStats,
	ServerStatsLog,
	ReversiGameDetailed,
} from './entities.js';
import {
	ReversiUpdateKey,
} from './consts.js';

type ReversiUpdateSettings<K extends ReversiUpdateKey> = {
	key: K;
	value: ReversiGameDetailed[K];
};

export type Channels = {
	main: {
		params: null;
		events: {
			notification: (payload: Notification) => void;
			mention: (payload: Note) => void;
			reply: (payload: Note) => void;
			renote: (payload: Note) => void;
			follow: (payload: UserDetailedNotMe) => void; // 自分が他人をフォローしたとき
			followed: (payload: UserDetailed | UserLite) => void; // 他人が自分をフォローしたとき
			unfollow: (payload: UserDetailed) => void; // 自分が他人をフォロー解除したとき
			meUpdated: (payload: UserDetailed) => void;
			pageEvent: (payload: PageEvent) => void;
			urlUploadFinished: (payload: { marker: string; file: DriveFile; }) => void;
			readAllNotifications: () => void;
			unreadNotification: (payload: Notification) => void;
			unreadMention: (payload: Note['id']) => void;
			readAllUnreadMentions: () => void;
			notificationFlushed: () => void;
			notificationDeleted: () => void;
			unreadSpecifiedNote: (payload: Note['id']) => void;
			readAllUnreadSpecifiedNotes: () => void;
			readAllMessagingMessages: () => void;
			readAllAntennas: () => void;
			unreadAntenna: (payload: Antenna) => void;
			newChatMessage: (payload: ChatMessage) => void;
			readAllAnnouncements: () => void;
			myTokenRegenerated: () => void;
			signin: (payload: Signin) => void;
			registryUpdated: (payload: {
				scope?: string[];
				key: string;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				value: any | null;
			}) => void;
			driveFileCreated: (payload: DriveFile) => void;
			readAntenna: (payload: Antenna) => void;
			receiveFollowRequest: (payload: User) => void;
			announcementCreated: (payload: AnnouncementCreated) => void;
			announcementReacted: (payload: AnnouncementReacted) => void;
			announcementUnreacted: (payload: AnnouncementUnreacted) => void;
		};
		receives: null;
	};
	homeTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withCats?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	localTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
			withCats?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hybridTimeline: {
		params: {
			withRenotes?: boolean;
			withReplies?: boolean;
			withFiles?: boolean;
			withCats?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	globalTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withCats?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	bubbleTimeline: {
		params: {
			withRenotes?: boolean;
			withFiles?: boolean;
			withCats?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	userList: {
		params: {
			listId: string;
			withFiles?: boolean;
			withRenotes?: boolean;
			withCats?: boolean;
			withBots?: boolean;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	hashtag: {
		params: {
			q: string[][];
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	roleTimeline: {
		params: {
			roleId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	antenna: {
		params: {
			antennaId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	channel: {
		params: {
			channelId: string;
		};
		events: {
			note: (payload: Note) => void;
		};
		receives: null;
	};
	clip: {
		params: {
			clipId: string;
		};
		events: {
			updated: () => void;
			deleted: () => void;
		};
		receives: null;
	};
	drive: {
		params: null;
		events: {
			fileCreated: (payload: DriveFile) => void;
			fileDeleted: (payload: DriveFile['id']) => void;
			fileUpdated: (payload: DriveFile) => void;
			folderCreated: (payload: DriveFolder) => void;
			folderDeleted: (payload: DriveFolder['id']) => void;
			folderUpdated: (payload: DriveFolder) => void;
		};
		receives: null;
	};
	serverStats: {
		params: null;
		events: {
			stats: (payload: ServerStats) => void;
			statsLog: (payload: ServerStatsLog) => void;
		};
		receives: {
			requestLog: {
				id: string | number;
				length: number;
			};
		};
	};
	queueStats: {
		params: null;
		events: {
			stats: (payload: QueueStats) => void;
			statsLog: (payload: QueueStatsLog) => void;
		};
		receives: {
			requestLog: {
				id: string | number;
				length: number;
			};
		};
	};
	admin: {
		params: null;
		events: {
			newAbuseUserReport: {
				id: string;
				targetUserId: string;
				reporterId: string;
				comment: string;
			}
		};
		receives: null;
	};
	reversi: {
		params: null;
		events: {
			matched: (payload: { game: ReversiGameDetailed }) => void;
			invited: (payload: { user: User }) => void;
		};
		receives: null;
	};
	reversiGame: {
		params: {
			gameId: string;
		};
		events: {
			started: (payload: { game: ReversiGameDetailed; }) => void;
			ended: (payload: { winnerId: User['id'] | null; game: ReversiGameDetailed; }) => void;
			canceled: (payload: { userId: User['id']; }) => void;
			changeReadyStates: (payload: { user1: boolean; user2: boolean; }) => void;
			updateSettings: <K extends ReversiUpdateKey>(payload: { userId: User['id']; key: K; value: ReversiGameDetailed[K]; }) => void;
			log: (payload: {
				time: number;
				player: boolean;
				operation: 'put';
				pos: number;
			} & { id: string | null }) => void;
			reacted: (payload: { userId: User['id']; reaction: string; }) => void;
		};
		receives: {
			putStone: {
				pos: number;
				id: string;
			};
			ready: boolean;
			cancel: null | Record<string, never>;
			updateSettings: ReversiUpdateSettings<ReversiUpdateKey>;
			claimTimeIsUp: null | Record<string, never>;
			reaction: string;
		}
	};
	chatUser: {
		params: {
			otherId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
		};
	};
	chatRoom: {
		params: {
			roomId: string;
		};
		events: {
			message: (payload: ChatMessageLite) => void;
			deleted: (payload: ChatMessageLite['id']) => void;
			react: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
			unreact: (payload: {
				reaction: string;
				user?: UserLite;
				messageId: ChatMessageLite['id'];
			}) => void;
		};
		receives: {
			read: {
				id: ChatMessageLite['id'];
			};
		};
	};
	mahjongRoom: {
		params: {
			roomId: string;
		};
		events: {
			joined: (payload: {
				index: number;
				user: UserLite | null;
			}) => void;
			left: (payload: {
				index: number;
			}) => void;
			canceled: (payload: {
				userId: string;
			}) => void;
			changeReadyStates: (payload: {
				user1: boolean;
				user2: boolean;
				user3: boolean;
				user4: boolean;
			}) => void;
			started: (payload: {
				room: MahjongRoomDetailed;
			}) => void;
			nextKyoku: (payload: {
				room: MahjongRoomDetailed;
			}) => void;
			ended: (payload: {
				room: MahjongRoomDetailed;
			}) => void;
			spectatorState: (payload: {
				room: MahjongRoomDetailed;
			}) => void;
			tsumo: (payload: {
				house: MahjongHouse;
				tile: number;
			}) => void;
			dahai: (payload: {
				house: MahjongHouse;
				tile: number;
				riichi: boolean;
			}) => void;
			dahaiAndTsumo: (payload: {
				dahaiHouse: MahjongHouse;
				dahaiTile: number;
				tsumoTile: number;
				riichi: boolean;
			}) => void;
			ponned: (payload: {
				caller: MahjongHouse;
				callee: MahjongHouse;
				tiles: readonly [number, number, number];
			}) => void;
			kanned: (payload: {
				caller: MahjongHouse;
				callee: MahjongHouse;
				tiles: readonly [number, number, number, number];
				rinsyan: number;
				doraIndicateTiles: number[];
			}) => void;
			ciied: (payload: {
				caller: MahjongHouse;
				callee: MahjongHouse;
				tiles: readonly [number, number, number];
			}) => void;
			ronned: (payload: {
				callers: MahjongHouse[];
				callee: MahjongHouse;
				handTiles: Record<MahjongHouse, number[]>;
				ronTile?: number;
				chankan?: boolean;
				uraDoraIndicateTiles: number[];
			}) => void;
			ryuukyoku: (payload: {
				tenpaiHouses: MahjongHouse[];
				notenHouses: MahjongHouse[];
				pointDeltas: Record<MahjongHouse, number>;
				abortive?: string;
				nagashiHouses?: MahjongHouse[];
			}) => void;
			ankanned: (payload: {
				house: MahjongHouse;
				tiles: readonly [number, number, number, number];
				rinsyan: number;
				doraIndicateTiles: number[];
			}) => void;
			kakanned: (payload: {
				house: MahjongHouse;
				tiles: readonly [number, number, number, number];
				rinsyan: number;
				from: MahjongHouse;
				doraIndicateTiles: number[];
			}) => void;
			kakanDeclared: (payload: {
				house: MahjongHouse;
				tiles: readonly [number, number, number, number];
				from: MahjongHouse;
				doraIndicateTiles: number[];
			}) => void;
			tsumoHora: (payload: {
				house: MahjongHouse;
				handTiles: number[];
				tsumoTile: number;
				uraDoraIndicateTiles: number[];
			}) => void;
		};
		receives: {
			ready: boolean;
			addAi: Record<string, never>;
			updateSettings: {
				key: 'timeLimitForEachTurn';
				value: number;
			} | {
				key: 'matchLength';
				value: 'east' | 'south';
			};
			removeAi: {
				index: number;
			};
			leave: Record<string, never>;
			confirmNextKyoku: Record<string, never>;
			dahai: {
				tile: number;
				riichi?: boolean;
			};
			tsumoHora: Record<string, never>;
			ronHora: Record<string, never>;
			pon: Record<string, never>;
			cii: {
				pattern: 'x__' | '_x_' | '__x';
			};
			kan: Record<string, never>;
			ankan: {
				tile: number;
			};
			kakan: {
				tile: number;
			};
			nop: Record<string, never>;
		};
	};
};

type MahjongHouse = 'e' | 's' | 'w' | 'n';

export type NoteUpdatedEvent = { id: Note['id'] } & ({
	type: 'reacted';
	body: {
		reaction: string;
		emoji?: {
			name: string;
			url: string;
		} | null;
		userId: User['id'];
	};
} | {
	type: 'unreacted';
	body: {
		reaction: string;
		userId: User['id'];
	};
} | {
	type: 'deleted';
	body: {
		deletedAt: string;
	};
} | {
	type: 'updated';
	body: {
		cw: string | null;
		text: string;
	};
} | {
	type: 'pollVoted';
	body: {
		choice: number;
		userId: User['id'];
	};
});

export type BroadcastEvents = {
	noteUpdated: (payload: NoteUpdatedEvent) => void;
	emojiAdded: (payload: EmojiAdded) => void;
	emojiUpdated: (payload: EmojiUpdated) => void;
	emojiDeleted: (payload: EmojiDeleted) => void;
	announcementCreated: (payload: AnnouncementCreated) => void;
	announcementReacted: (payload: AnnouncementReacted) => void;
	announcementUnreacted: (payload: AnnouncementUnreacted) => void;
};
