import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { UserProfilesModule } from './modules/user-profiles/user-profiles.module'
import { PostsModule } from './modules/posts/posts.module'
import { HashtagsModule } from './modules/posts/hashtags/hashtags.module'
import { UserVerificationsModule } from './modules/user-verifications/user-verifications.module'
import { CommentsModule } from './modules/comments/comments.module'
import { RepliesModule } from './modules/replies/replies.module'
import { LikesModule } from './modules/likes/likes.module'
import { FollowsModule } from './modules/follows/follows.module'
import { BookmarksModule } from './modules/bookmarks/bookmarks.module'
import { PostRepostsModule } from './modules/posts/post-reposts/post-reposts.module'
import { SupportConversationsModule } from './modules/support-conversations/support-conversations.module'
import { SupportMessagesModule } from './modules/support-messages/support-messages.module'
import { ConversationsModule } from './modules/conversations/conversations.module'
import { MessagesModule } from './modules/messages/messages.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { PostHashtagsModule } from './modules/posts/post-hashtags/post-hashtags.module'
import { PostMentionsModule } from './modules/posts/post-mentions/post-mentions.module'
import { PostQuotesModule } from './modules/posts/post-quotes/post-quotes.module'

export const Modules = [
  AuthModule,
  BookmarksModule,
  CommentsModule,
  ConversationsModule,
  FollowsModule,
  LikesModule,
  MessagesModule,
  NotificationsModule,
  HashtagsModule,
  PostHashtagsModule, //
  PostMentionsModule, //
  PostQuotesModule, //
  PostRepostsModule,
  PostsModule,
  RepliesModule,
  SupportConversationsModule,
  SupportMessagesModule,
  UserProfilesModule,
  UserVerificationsModule,
  UsersModule,
]
