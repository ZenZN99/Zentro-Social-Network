import { and, count, desc, eq, getTableColumns } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { database } from '../../config/db/drizzle'
import { UserSchema } from '../users/schemas/user.schema'
import { SupportConversationSchema } from './schemas/support-conversation.schema'
import { SupportConversationStatus } from './schemas/enums/status'
import { buildPagination } from '../../utilities/pagination'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { UserRole } from '../users/schemas/enums/user-role'
import {
  SpongBadRequestException,
  SpongNotFoundException,
  SpongUnauthorizedException,
} from 'riser-bob'

export class SupportConversationsService {
  constructor(private readonly db: typeof database) {}

  async create(userId: string) {
    // Check if the user already has an open conversation
    const [existingConversation] = await this.db
      .select()
      .from(SupportConversationSchema)
      .where(
        and(
          eq(SupportConversationSchema.userId, userId),
          eq(SupportConversationSchema.status, SupportConversationStatus.OPEN),
        ),
      )
      .limit(1)

    if (existingConversation) {
      throw new SpongBadRequestException({
        success: false,
        message: 'You already have an open support conversation',
      })
    }

    // Make sure the user exists
    const [user] = await this.db
      .select({ id: UserSchema.id })
      .from(UserSchema)
      .where(eq(UserSchema.id, userId))
      .limit(1)

    if (!user) {
      throw new SpongUnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const [conversation] = await this.db
      .insert(SupportConversationSchema)
      .values({
        userId,
        status: SupportConversationStatus.OPEN,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return {
      success: true,
      message: 'Support conversation created successfully',
      data: conversation,
    }
  }

  async findAll(page = 1, limit = 10, offset = (page - 1) * limit) {
    const lastMessageSender = alias(UserSchema, 'last_message_sender')
    const closedByUser = alias(UserSchema, 'closed_by_user')

    const rows = await this.db
      .select({
        ...getTableColumns(SupportConversationSchema),

        userJoinId: UserSchema.id,
        userFirstName: UserSchema.firstName,
        userLastName: UserSchema.lastName,
        userUsername: UserSchema.username,
        userEmail: UserSchema.email,

        profileId: UserProfileSchema.id,
        profileAvatar: UserProfileSchema.avatar,

        senderId: lastMessageSender.id,
        senderFirstName: lastMessageSender.firstName,
        senderLastName: lastMessageSender.lastName,

        closedByUserId: closedByUser.id,
        closedByFirstName: closedByUser.firstName,
        closedByLastName: closedByUser.lastName,
      })
      .from(SupportConversationSchema)
      .leftJoin(UserSchema, eq(SupportConversationSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .leftJoin(
        lastMessageSender,
        eq(SupportConversationSchema.lastMessageSenderId, lastMessageSender.id),
      )
      .leftJoin(closedByUser, eq(SupportConversationSchema.closedBy, closedByUser.id))
      .orderBy(desc(SupportConversationSchema.updatedAt))
      .limit(limit)
      .offset(offset)

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: count() })
      .from(SupportConversationSchema)

    const conversations = rows.map((row) => {
      const {
        userJoinId,
        userFirstName,
        userLastName,
        userUsername,
        userEmail,
        profileId,
        profileAvatar,
        senderId,
        senderFirstName,
        senderLastName,
        closedByUserId,
        closedByFirstName,
        closedByLastName,
        ...conversation
      } = row

      return {
        ...conversation,

        user: userJoinId
          ? {
              id: userJoinId,
              firstName: userFirstName,
              lastName: userLastName,
              username: userUsername,
              email: userEmail,
              profile: profileId ? { avatar: profileAvatar } : null,
            }
          : null,

        lastMessageSender: senderId
          ? {
              id: senderId,
              firstName: senderFirstName,
              lastName: senderLastName,
            }
          : null,

        closedByUser: closedByUserId
          ? {
              id: closedByUserId,
              firstName: closedByFirstName,
              lastName: closedByLastName,
            }
          : null,
      }
    })

    return {
      success: true,
      data: conversations,
      pagination: buildPagination(total, page, limit),
    }
  }

  async findMe(userId: string) {
    const lastMessageSender = alias(UserSchema, 'last_message_sender')

    const rows = await this.db
      .select({
        ...getTableColumns(SupportConversationSchema),

        userJoinId: UserSchema.id,
        userFirstName: UserSchema.firstName,
        userLastName: UserSchema.lastName,
        userUsername: UserSchema.username,
        userEmail: UserSchema.email,

        profileId: UserProfileSchema.id,
        profileAvatar: UserProfileSchema.avatar,

        senderId: lastMessageSender.id,
        senderFirstName: lastMessageSender.firstName,
        senderLastName: lastMessageSender.lastName,
        senderUsername: lastMessageSender.username,
        senderEmail: lastMessageSender.email,
      })
      .from(SupportConversationSchema)
      .leftJoin(UserSchema, eq(SupportConversationSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .leftJoin(
        lastMessageSender,
        eq(SupportConversationSchema.lastMessageSenderId, lastMessageSender.id),
      )
      .where(eq(SupportConversationSchema.userId, userId))
      .orderBy(desc(SupportConversationSchema.updatedAt))

    const conversations = rows.map((row) => {
      const {
        userJoinId,
        userFirstName,
        userLastName,
        userUsername,
        userEmail,
        profileId,
        profileAvatar,
        senderId,
        senderFirstName,
        senderLastName,
        senderUsername,
        senderEmail,
        ...conversation
      } = row

      return {
        ...conversation,

        user: userJoinId
          ? {
              id: userJoinId,
              firstName: userFirstName,
              lastName: userLastName,
              username: userUsername,
              email: userEmail,
              profile: profileId ? { avatar: profileAvatar } : null,
            }
          : null,

        lastMessageSender: senderId
          ? {
              id: senderId,
              firstName: senderFirstName,
              lastName: senderLastName,
              username: senderUsername,
              email: senderEmail,
            }
          : null,
      }
    })

    return {
      success: true,
      data: conversations,
    }
  }

  async findOne(userId: string, conversationId: string) {
    const [currentUser] = await this.db
      .select({
        id: UserSchema.id,
        role: UserSchema.role,
      })
      .from(UserSchema)
      .where(eq(UserSchema.id, userId))
      .limit(1)

    if (!currentUser) {
      throw new SpongUnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const isStaff = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.SUPPORT

    const lastMessageSender = alias(UserSchema, 'last_message_sender')
    const closedByUser = alias(UserSchema, 'closed_by_user')

    const conditions = isStaff
      ? eq(SupportConversationSchema.id, conversationId)
      : and(
          eq(SupportConversationSchema.id, conversationId),
          eq(SupportConversationSchema.userId, userId),
        )

    const [row] = await this.db
      .select({
        ...getTableColumns(SupportConversationSchema),

        userJoinId: UserSchema.id,
        userFirstName: UserSchema.firstName,
        userLastName: UserSchema.lastName,
        userUsername: UserSchema.username,
        userEmail: UserSchema.email,

        profileId: UserProfileSchema.id,
        profileAvatar: UserProfileSchema.avatar,

        senderId: lastMessageSender.id,
        senderFirstName: lastMessageSender.firstName,
        senderLastName: lastMessageSender.lastName,

        closedByUserId: closedByUser.id,
        closedByFirstName: closedByUser.firstName,
        closedByLastName: closedByUser.lastName,
      })
      .from(SupportConversationSchema)
      .leftJoin(UserSchema, eq(SupportConversationSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .leftJoin(
        lastMessageSender,
        eq(SupportConversationSchema.lastMessageSenderId, lastMessageSender.id),
      )
      .leftJoin(closedByUser, eq(SupportConversationSchema.closedBy, closedByUser.id))
      .where(conditions)
      .limit(1)

    if (!row) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Support conversation not found',
      })
    }

    const {
      userJoinId,
      userFirstName,
      userLastName,
      userUsername,
      userEmail,
      profileId,
      profileAvatar,
      senderId,
      senderFirstName,
      senderLastName,
      closedByUserId,
      closedByFirstName,
      closedByLastName,
      ...conversation
    } = row

    const result = {
      ...conversation,

      user: userJoinId
        ? {
            id: userJoinId,
            firstName: userFirstName,
            lastName: userLastName,
            username: userUsername,
            email: userEmail,
            profile: profileId ? { avatar: profileAvatar } : null,
          }
        : null,

      lastMessageSender: senderId
        ? {
            id: senderId,
            firstName: senderFirstName,
            lastName: senderLastName,
          }
        : null,

      closedByUser: closedByUserId
        ? {
            id: closedByUserId,
            firstName: closedByFirstName,
            lastName: closedByLastName,
          }
        : null,
    }

    return {
      success: true,
      data: result,
    }
  }

  async toggle(adminId: string, conversationId: string) {
    const [conversation] = await this.db
      .select()
      .from(SupportConversationSchema)
      .where(eq(SupportConversationSchema.id, conversationId))
      .limit(1)

    if (!conversation) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Support conversation not found',
      })
    }

    if (conversation.status === SupportConversationStatus.OPEN) {
      const [updatedConversation] = await this.db
        .update(SupportConversationSchema)
        .set({
          status: SupportConversationStatus.CLOSED,
          closedAt: new Date(),
          closedBy: adminId,
          updatedAt: new Date(),
        })
        .where(eq(SupportConversationSchema.id, conversationId))
        .returning()

      return {
        success: true,
        data: updatedConversation,
        message: 'Support conversation closed successfully',
      }
    }

    const [updatedConversation] = await this.db
      .update(SupportConversationSchema)
      .set({
        status: SupportConversationStatus.OPEN,
        closedAt: null,
        closedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(SupportConversationSchema.id, conversationId))
      .returning()

    return {
      success: true,
      message: 'Support conversation opened successfully',
      data: updatedConversation,
    }
  }
}
