/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	FindOneOptions,
	ObjectLiteral,
	Repository,
} from 'typeorm';
import { MiAbuseReportResolver } from '@/models/AbuseReportResolver.js';
import { MiAbuseReportNotificationRecipient } from '@/models/AbuseReportNotificationRecipient.js';
import { MiAbuseUserReport } from '@/models/AbuseUserReport.js';
import { MiAccessToken } from '@/models/AccessToken.js';
import { MiAd } from '@/models/Ad.js';
import { MiAnnouncement } from '@/models/Announcement.js';
import { MiAnnouncementRead } from '@/models/AnnouncementRead.js';
import { MiAnnouncementReaction } from '@/models/AnnouncementReaction.js';
import { MiAntenna } from '@/models/Antenna.js';
import { MiApp } from '@/models/App.js';
import { MiAuthSession } from '@/models/AuthSession.js';
import { MiAvatarDecoration } from '@/models/AvatarDecoration.js';
import { MiBlocking } from '@/models/Blocking.js';
import { MiBubbleGameRecord } from '@/models/BubbleGameRecord.js';
import { MiChannel } from '@/models/Channel.js';
import { MiChannelFavorite } from '@/models/ChannelFavorite.js';
import { MiChannelMuting } from '@/models/ChannelMuting.js';
import { MiChatApproval } from '@/models/ChatApproval.js';
import { MiChatMessage } from '@/models/ChatMessage.js';
import { MiChatRoom } from '@/models/ChatRoom.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { MiChatRoomMembership } from '@/models/ChatRoomMembership.js';
import { MiClip } from '@/models/Clip.js';
import { MiClipFavorite } from '@/models/ClipFavorite.js';
import { MiClipNote } from '@/models/ClipNote.js';
import { MiClipFavoriteRemote } from '@/models/ClipFavoriteRemote.js';
import { MiDriveFile } from '@/models/DriveFile.js';
import { MiDriveFolder } from '@/models/DriveFolder.js';
import { MiEmoji } from '@/models/Emoji.js';
import { MiEvent } from '@/models/Event.js';
import { MiFlash } from '@/models/Flash.js';
import { MiFlashLike } from '@/models/FlashLike.js';
import { MiFlashLikeRemote } from '@/models/FlashLikeRemote.js';
import { MiFollowing } from '@/models/Following.js';
import { MiFollowRequest } from '@/models/FollowRequest.js';
import { MiGalleryLike } from '@/models/GalleryLike.js';
import { MiGalleryPost } from '@/models/GalleryPost.js';
import { MiHashtag } from '@/models/Hashtag.js';
import { MiInstance } from '@/models/Instance.js';
import { MiMeta } from '@/models/Meta.js';
import { MiModerationLog } from '@/models/ModerationLog.js';
import { MiMuting } from '@/models/Muting.js';
import { MiNote } from '@/models/Note.js';
import { MiNoteDraft } from '@/models/NoteDraft.js';
import { MiNoteFavorite } from '@/models/NoteFavorite.js';
import { MiNoteReaction } from '@/models/NoteReaction.js';
import { MiNoteThreadMuting } from '@/models/NoteThreadMuting.js';
import { MiNoteUnread } from '@/models/NoteUnread.js';
import { MiOfficialTag } from '@/models/OfficialTag.js';
import { MiPage } from '@/models/Page.js';
import { MiPageLike } from '@/models/PageLike.js';
import { MiPasswordResetRequest } from '@/models/PasswordResetRequest.js';
import { MiPoll } from '@/models/Poll.js';
import { MiPollVote } from '@/models/PollVote.js';
import { MiPromoNote } from '@/models/PromoNote.js';
import { MiPromoRead } from '@/models/PromoRead.js';
import { MiRegistrationTicket } from '@/models/RegistrationTicket.js';
import { MiRegistryItem } from '@/models/RegistryItem.js';
import { MiRelay } from '@/models/Relay.js';
import { MiRenoteMuting } from '@/models/RenoteMuting.js';
import { MiRetentionAggregation } from '@/models/RetentionAggregation.js';
import { MiReversiGame } from '@/models/ReversiGame.js';
import { MiRole } from '@/models/Role.js';
import { MiRoleAssignment } from '@/models/RoleAssignment.js';
import { MiSignin } from '@/models/Signin.js';
import { MiSwSubscription } from '@/models/SwSubscription.js';
import { MiSystemAccount } from '@/models/SystemAccount.js';
import { MiSystemWebhook } from '@/models/SystemWebhook.js';
import { MiUsedUsername } from '@/models/UsedUsername.js';
import { MiUser } from '@/models/User.js';
import { MiUserGroup } from '@/models/UserGroup.js';
import { MiUserGroupInvitation } from '@/models/UserGroupInvitation.js';
import { MiUserGroupJoining } from '@/models/UserGroupJoining.js';
import { MiUserIp } from '@/models/UserIp.js';
import { MiUserKeypair } from '@/models/UserKeypair.js';
import { MiUserList } from '@/models/UserList.js';
import { MiUserListFavorite } from '@/models/UserListFavorite.js';
import { MiUserListMembership } from '@/models/UserListMembership.js';
import { MiUserMemo } from '@/models/UserMemo.js';
import { MiUserNotePining } from '@/models/UserNotePining.js';
import { MiUserPending } from '@/models/UserPending.js';
import { MiUserProfile } from '@/models/UserProfile.js';
import { MiUserPublickey } from '@/models/UserPublickey.js';
import { MiUserSecurityKey } from '@/models/UserSecurityKey.js';
import { MiWebhook } from '@/models/Webhook.js';
import { MiChannel } from '@/models/Channel.js';
import { MiRetentionAggregation } from '@/models/RetentionAggregation.js';
import { MiRole } from '@/models/Role.js';
import { MiRoleAssignment } from '@/models/RoleAssignment.js';
import { MiFlash } from '@/models/Flash.js';
import { MiFlashLike } from '@/models/FlashLike.js';
import { MiUserListFavorite } from '@/models/UserListFavorite.js';
import { MiBubbleGameRecord } from '@/models/BubbleGameRecord.js';
import { MiReversiGame } from '@/models/ReversiGame.js';
import { MiMahjongGame } from '@/models/MahjongGame.js';

export interface MiRepository<T extends ObjectLiteral> {
	insertOne(this: Repository<T> & MiRepository<T>, entity: QueryDeepPartialEntity<T>, findOptions?: Pick<FindOneOptions<T>, 'relations'>): Promise<T>;
}

export const miRepository = {
	async insertOne(entity, findOptions?) {
		return await this.insert(entity).then(x => this.findOneOrFail({ where: x.identifiers[0], ...findOptions }));
	},
} satisfies MiRepository<ObjectLiteral>;

export {
	MiAbuseReportResolver,
	MiAbuseUserReport,
	MiAbuseReportNotificationRecipient,
	MiAccessToken,
	MiAd,
	MiAnnouncement,
	MiAnnouncementRead,
	MiAnnouncementReaction,
	MiAntenna,
	MiApp,
	MiAvatarDecoration,
	MiAuthSession,
	MiBlocking,
	MiChannelFavorite,
	MiChannelMuting,
	MiClip,
	MiClipNote,
	MiClipFavorite,
	MiClipFavoriteRemote,
	MiDriveFile,
	MiDriveFolder,
	MiEmoji,
	MiEvent,
	MiFollowing,
	MiFollowRequest,
	MiGalleryLike,
	MiGalleryPost,
	MiHashtag,
	MiInstance,
	MiMeta,
	MiModerationLog,
	MiMuting,
	MiRenoteMuting,
	MiNote,
	MiNoteDraft,
	MiNoteFavorite,
	MiNoteReaction,
	MiNoteThreadMuting,
	MiNoteUnread,
	MiOfficialTag,
	MiPage,
	MiPageLike,
	MiPasswordResetRequest,
	MiPoll,
	MiPollVote,
	MiPromoNote,
	MiPromoRead,
	MiRegistrationTicket,
	MiRegistryItem,
	MiRelay,
	MiSignin,
	MiSwSubscription,
	MiSystemAccount,
	MiUsedUsername,
	MiUser,
	MiUserGroup,
	MiUserGroupInvitation,
	MiUserGroupJoining,
	MiUserIp,
	MiUserKeypair,
	MiUserList,
	MiUserListFavorite,
	MiUserListMembership,
	MiUserNotePining,
	MiUserPending,
	MiUserProfile,
	MiUserPublickey,
	MiUserSecurityKey,
	MiWebhook,
	MiSystemWebhook,
	MiChannel,
	MiRetentionAggregation,
	MiRole,
	MiRoleAssignment,
	MiFlash,
	MiFlashLike,
	MiFlashLikeRemote,
	MiUserMemo,
	MiChatMessage,
	MiChatRoom,
	MiChatRoomMembership,
	MiChatRoomInvitation,
	MiChatApproval,
	MiBubbleGameRecord,
	MiReversiGame,
	MiMahjongGame,
};

export type AbuseUserReportsRepository = Repository<MiAbuseUserReport>;
export type AccessTokensRepository = Repository<MiAccessToken>;
export type AdsRepository = Repository<MiAd>;
export type AnnouncementsRepository = Repository<MiAnnouncement>;
export type AnnouncementReadsRepository = Repository<MiAnnouncementRead>;
export type AntennasRepository = Repository<MiAntenna>;
export type AppsRepository = Repository<MiApp>;
export type AvatarDecorationsRepository = Repository<MiAvatarDecoration>;
export type AuthSessionsRepository = Repository<MiAuthSession>;
export type BlockingsRepository = Repository<MiBlocking>;
export type ChannelFollowingsRepository = Repository<MiChannelFollowing>;
export type ChannelFavoritesRepository = Repository<MiChannelFavorite>;
export type ClipsRepository = Repository<MiClip>;
export type ClipNotesRepository = Repository<MiClipNote>;
export type ClipFavoritesRepository = Repository<MiClipFavorite>;
export type DriveFilesRepository = Repository<MiDriveFile>;
export type DriveFoldersRepository = Repository<MiDriveFolder>;
export type EmojisRepository = Repository<MiEmoji>;
export type FollowingsRepository = Repository<MiFollowing>;
export type FollowRequestsRepository = Repository<MiFollowRequest>;
export type GalleryLikesRepository = Repository<MiGalleryLike>;
export type GalleryPostsRepository = Repository<MiGalleryPost>;
export type HashtagsRepository = Repository<MiHashtag>;
export type InstancesRepository = Repository<MiInstance>;
export type MetasRepository = Repository<MiMeta>;
export type ModerationLogsRepository = Repository<MiModerationLog>;
export type MutingsRepository = Repository<MiMuting>;
export type RenoteMutingsRepository = Repository<MiRenoteMuting>;
export type NotesRepository = Repository<MiNote>;
export type NoteFavoritesRepository = Repository<MiNoteFavorite>;
export type NoteReactionsRepository = Repository<MiNoteReaction>;
export type NoteThreadMutingsRepository = Repository<MiNoteThreadMuting>;
export type NoteUnreadsRepository = Repository<MiNoteUnread>;
export type PagesRepository = Repository<MiPage>;
export type PageLikesRepository = Repository<MiPageLike>;
export type PasswordResetRequestsRepository = Repository<MiPasswordResetRequest>;
export type PollsRepository = Repository<MiPoll>;
export type PollVotesRepository = Repository<MiPollVote>;
export type PromoNotesRepository = Repository<MiPromoNote>;
export type PromoReadsRepository = Repository<MiPromoRead>;
export type RegistrationTicketsRepository = Repository<MiRegistrationTicket>;
export type RegistryItemsRepository = Repository<MiRegistryItem>;
export type RelaysRepository = Repository<MiRelay>;
export type SigninsRepository = Repository<MiSignin>;
export type SwSubscriptionsRepository = Repository<MiSwSubscription>;
export type UsedUsernamesRepository = Repository<MiUsedUsername>;
export type UsersRepository = Repository<MiUser>;
export type UserIpsRepository = Repository<MiUserIp>;
export type UserKeypairsRepository = Repository<MiUserKeypair>;
export type UserListsRepository = Repository<MiUserList>;
export type UserListFavoritesRepository = Repository<MiUserListFavorite>;
export type UserListMembershipsRepository = Repository<MiUserListMembership>;
export type UserNotePiningsRepository = Repository<MiUserNotePining>;
export type UserPendingsRepository = Repository<MiUserPending>;
export type UserProfilesRepository = Repository<MiUserProfile>;
export type UserPublickeysRepository = Repository<MiUserPublickey>;
export type UserSecurityKeysRepository = Repository<MiUserSecurityKey>;
export type WebhooksRepository = Repository<MiWebhook>;
export type ChannelsRepository = Repository<MiChannel>;
export type RetentionAggregationsRepository = Repository<MiRetentionAggregation>;
export type RolesRepository = Repository<MiRole>;
export type RoleAssignmentsRepository = Repository<MiRoleAssignment>;
export type FlashsRepository = Repository<MiFlash>;
export type FlashLikesRepository = Repository<MiFlashLike>;
export type UserMemoRepository = Repository<MiUserMemo>;
export type BubbleGameRecordsRepository = Repository<MiBubbleGameRecord>;
export type ReversiGamesRepository = Repository<MiReversiGame>;
export type MahjongGamesRepository = Repository<MiMahjongGame>;
