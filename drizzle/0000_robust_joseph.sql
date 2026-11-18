CREATE TYPE "public"."notification_type" AS ENUM('role updated', 'account blocked', 'user verification', 'user verification approved', 'user verification rejected', 'reply', 'new post', 'message', 'like', 'repost', 'comment', 'follow');--> statement-breakpoint
CREATE TYPE "public"."visibility_status" AS ENUM('public', 'followers', 'private');--> statement-breakpoint
CREATE TYPE "public"."support_conversation_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_verification_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'support', 'user');--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"postId" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" varchar(300) NOT NULL,
	"postId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"likesCount" integer DEFAULT 0 NOT NULL,
	"repliesCount" integer DEFAULT 0 NOT NULL,
	"isEdited" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"senderId" uuid NOT NULL,
	"receiverId" uuid NOT NULL,
	"lastMessage" text DEFAULT '' NOT NULL,
	"lastMessageSenderId" uuid,
	"isMutedBySender" boolean DEFAULT false NOT NULL,
	"isMutedByReceiver" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"followerId" uuid NOT NULL,
	"followingId" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"postId" uuid,
	"commentId" uuid,
	"replyId" uuid,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"conversationId" uuid NOT NULL,
	"content" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"senderId" uuid NOT NULL,
	"receiverId" uuid NOT NULL,
	"targetId" uuid,
	"type" "notification_type" NOT NULL,
	"message" varchar(255) NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"link" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"postsCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_hashtags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"postId" uuid NOT NULL,
	"hashtagId" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"postId" uuid NOT NULL,
	"mentionedUserId" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"postId" uuid NOT NULL,
	"quotedPostId" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "post_quotes_postId_unique" UNIQUE("postId")
);
--> statement-breakpoint
CREATE TABLE "post_reposts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"postId" uuid NOT NULL,
	"repostedByUserId" uuid NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" varchar(300) NOT NULL,
	"images" jsonb DEFAULT 'null'::jsonb,
	"authorId" uuid NOT NULL,
	"viewsCount" integer DEFAULT 0 NOT NULL,
	"likesCount" integer DEFAULT 0 NOT NULL,
	"commentsCount" integer DEFAULT 0 NOT NULL,
	"repostsCount" integer DEFAULT 0 NOT NULL,
	"quotesCount" integer DEFAULT 0 NOT NULL,
	"bookmarksCount" integer DEFAULT 0 NOT NULL,
	"isPin" boolean DEFAULT false NOT NULL,
	"isEdited" boolean DEFAULT false NOT NULL,
	"visibility" "visibility_status" DEFAULT 'public' NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" varchar(300) NOT NULL,
	"commentId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"parentReplyId" uuid,
	"likesCount" integer DEFAULT 0 NOT NULL,
	"isEdited" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"status" "support_conversation_status" DEFAULT 'open' NOT NULL,
	"lastMessage" text DEFAULT '',
	"lastMessageSenderId" uuid,
	"closedAt" timestamp,
	"closedBy" uuid,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversationId" uuid NOT NULL,
	"senderId" uuid NOT NULL,
	"message" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"avatar" jsonb DEFAULT 'null'::jsonb,
	"cover" jsonb DEFAULT 'null'::jsonb,
	"bio" varchar(300) DEFAULT '' NOT NULL,
	"socials" jsonb DEFAULT '{"facebookUrl":null,"instagramUrl":null,"youtubeUrl":null,"threadsUrl":null,"twitterUrl":null,"tiktokUrl":null,"snapchatUrl":null,"pinterestUrl":null,"redditUrl":null,"telegramUrl":null,"whatsappUrl":null}'::jsonb NOT NULL,
	"website" varchar(2048),
	"isPrivate" boolean DEFAULT false NOT NULL,
	"postsCount" integer DEFAULT 0 NOT NULL,
	"commentsCount" integer DEFAULT 0 NOT NULL,
	"repliesCount" integer DEFAULT 0 NOT NULL,
	"followingCount" integer DEFAULT 0 NOT NULL,
	"followersCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "user_profiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "user_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"profileImage" jsonb DEFAULT 'null'::jsonb,
	"identityDocument" jsonb DEFAULT 'null'::jsonb,
	"status" "user_verification_status",
	"rejectionReason" text,
	"submittedAt" timestamp with time zone,
	"reviewedAt" timestamp with time zone,
	"reviewedBy" uuid,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firstName" varchar(50) NOT NULL,
	"lastName" varchar(50) NOT NULL,
	"username" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastLoginAt" timestamp,
	"refreshToken" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_receiverId_users_id_fk" FOREIGN KEY ("receiverId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lastMessageSenderId_users_id_fk" FOREIGN KEY ("lastMessageSenderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_users_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followingId_users_id_fk" FOREIGN KEY ("followingId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_commentId_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_replyId_replies_id_fk" FOREIGN KEY ("replyId") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiverId_users_id_fk" FOREIGN KEY ("receiverId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_hashtags" ADD CONSTRAINT "post_hashtags_hashtagId_hashtags_id_fk" FOREIGN KEY ("hashtagId") REFERENCES "public"."hashtags"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_mentionedUserId_users_id_fk" FOREIGN KEY ("mentionedUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_quotes" ADD CONSTRAINT "post_quotes_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_quotes" ADD CONSTRAINT "post_quotes_quotedPostId_posts_id_fk" FOREIGN KEY ("quotedPostId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_postId_posts_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "post_reposts" ADD CONSTRAINT "post_reposts_repostedByUserId_users_id_fk" FOREIGN KEY ("repostedByUserId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_users_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_commentId_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_parentReplyId_replies_id_fk" FOREIGN KEY ("parentReplyId") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_lastMessageSenderId_users_id_fk" FOREIGN KEY ("lastMessageSenderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_closedBy_users_id_fk" FOREIGN KEY ("closedBy") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversationId_support_conversations_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."support_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_senderId_users_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_verifications" ADD CONSTRAINT "user_verifications_reviewedBy_users_id_fk" FOREIGN KEY ("reviewedBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_userId_postId_unique" ON "bookmarks" USING btree ("userId","postId");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_idx" ON "bookmarks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarks_postId_idx" ON "bookmarks" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "bookmarks_createdAt_idx" ON "bookmarks" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "comments_postId_idx" ON "comments" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "comments_userId_idx" ON "comments" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "comments_postId_createdAt_idx" ON "comments" USING btree ("postId","createdAt");--> statement-breakpoint
CREATE INDEX "conversations_senderId_idx" ON "conversations" USING btree ("senderId");--> statement-breakpoint
CREATE INDEX "conversations_receiverId_idx" ON "conversations" USING btree ("receiverId");--> statement-breakpoint
CREATE INDEX "conversations_lastMessageSenderId_idx" ON "conversations" USING btree ("lastMessageSenderId");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_followerId_followingId_unique" ON "follows" USING btree ("followerId","followingId");--> statement-breakpoint
CREATE INDEX "follows_followerId_idx" ON "follows" USING btree ("followerId");--> statement-breakpoint
CREATE INDEX "follows_followingId_idx" ON "follows" USING btree ("followingId");--> statement-breakpoint
CREATE INDEX "likes_userId_idx" ON "likes" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "likes_postId_idx" ON "likes" USING btree ("postId");--> statement-breakpoint
CREATE INDEX "likes_commentId_idx" ON "likes" USING btree ("commentId");--> statement-breakpoint
CREATE INDEX "likes_replyId_idx" ON "likes" USING btree ("replyId");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_userId_postId_unique" ON "likes" USING btree ("userId","postId");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_userId_commentId_unique" ON "likes" USING btree ("userId","commentId");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_userId_replyId_unique" ON "likes" USING btree ("userId","replyId");--> statement-breakpoint
CREATE INDEX "messages_userId_idx" ON "messages" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "messages_conversationId_idx" ON "messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "notifications_receiverId_idx" ON "notifications" USING btree ("receiverId");--> statement-breakpoint
CREATE UNIQUE INDEX "hashtags_name_unique" ON "hashtags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "hashtags_postsCount_idx" ON "hashtags" USING btree ("postsCount");--> statement-breakpoint
CREATE UNIQUE INDEX "post_hashtags_postId_hashtagId_unique" ON "post_hashtags" USING btree ("postId","hashtagId");--> statement-breakpoint
CREATE INDEX "post_hashtags_hashtagId_idx" ON "post_hashtags" USING btree ("hashtagId");--> statement-breakpoint
CREATE UNIQUE INDEX "post_mentions_postId_mentionedUserId_unique" ON "post_mentions" USING btree ("postId","mentionedUserId");--> statement-breakpoint
CREATE INDEX "post_mentions_mentionedUserId_idx" ON "post_mentions" USING btree ("mentionedUserId");--> statement-breakpoint
CREATE INDEX "post_quotes_quotedPostId_idx" ON "post_quotes" USING btree ("quotedPostId");--> statement-breakpoint
CREATE UNIQUE INDEX "post_reposts_postId_repostedByUserId_unique" ON "post_reposts" USING btree ("postId","repostedByUserId");--> statement-breakpoint
CREATE INDEX "post_reposts_repostedByUserId_idx" ON "post_reposts" USING btree ("repostedByUserId");--> statement-breakpoint
CREATE INDEX "posts_authorId_idx" ON "posts" USING btree ("authorId");--> statement-breakpoint
CREATE INDEX "posts_visibility_idx" ON "posts" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "posts_createdAt_idx" ON "posts" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "posts_authorId_createdAt_idx" ON "posts" USING btree ("authorId","createdAt");--> statement-breakpoint
CREATE INDEX "replies_commentId_idx" ON "replies" USING btree ("commentId");--> statement-breakpoint
CREATE INDEX "replies_userId_idx" ON "replies" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "replies_parentReplyId_idx" ON "replies" USING btree ("parentReplyId");--> statement-breakpoint
CREATE INDEX "replies_createdAt_idx" ON "replies" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "support_conversations_userId_idx" ON "support_conversations" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "support_conversations_status_idx" ON "support_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_messages_conversationId_idx" ON "support_messages" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "support_messages_senderId_idx" ON "support_messages" USING btree ("senderId");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");