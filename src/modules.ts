import type { RiserBob } from 'riser-bob'
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
import type { Server } from 'socket.io'
import { NotificationsModule } from './modules/notifications/notifications.module'

export const Modules = async (bob: RiserBob, io: Server) => {
  new AuthModule().register(bob)
  new UsersModule().register(bob, io)
  new UserProfilesModule().register(bob)
  new UserVerificationsModule().register(bob, io)
  new PostsModule().register(bob, io)
  new HashtagsModule().register(bob)
  new PostRepostsModule().register(bob, io)
  new CommentsModule().register(bob, io)
  new RepliesModule().register(bob, io)
  new LikesModule().register(bob, io)
  new FollowsModule().register(bob, io)
  new BookmarksModule().register(bob)
  new SupportConversationsModule().register(bob)
  new SupportMessagesModule().register(bob)
  new ConversationsModule().register(bob)
  new MessagesModule().register(bob, io)
  new NotificationsModule().register(bob, io)
}
