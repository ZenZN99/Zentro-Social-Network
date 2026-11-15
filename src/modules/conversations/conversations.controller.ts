import type { SpongHandler } from 'riser-bob'
import type { database } from '../../config/db/drizzle'
import { ConversationSchema } from './schemas/conversation.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { and, desc, eq, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { UserSchema } from '../users/schemas/user.schema'

const senderUser = alias(UserSchema, 'sender_user')
const receiverUser = alias(UserSchema, 'receiver_user')

const senderProfile = alias(UserProfileSchema, 'sender_profile')
const receiverProfile = alias(UserProfileSchema, 'receiver_profile')

export class ConversationsController {
  constructor(private readonly db: typeof database) {}

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const result = await this.db
      .select({
        id: ConversationSchema.id,
        senderId: ConversationSchema.senderId,
        receiverId: ConversationSchema.receiverId,
        lastMessage: ConversationSchema.lastMessage,
        lastMessageSenderId: ConversationSchema.lastMessageSenderId,
        isMutedBySender: ConversationSchema.isMutedBySender,
        isMutedByReceiver: ConversationSchema.isMutedByReceiver,
        createdAt: ConversationSchema.createdAt,
        updatedAt: ConversationSchema.updatedAt,

        senderUserId: senderUser.id,
        senderFirstName: senderUser.firstName,
        senderLastName: senderUser.lastName,
        senderUsername: senderUser.username,
        senderAvatar: UserProfileSchema.avatar,

        receiverUserId: receiverUser.id,
        receiverFirstName: receiverUser.firstName,
        receiverLastName: receiverUser.lastName,
        receiverUsername: receiverUser.username,
        receiverAvatar: receiverProfile.avatar,
      })
      .from(ConversationSchema)
      .leftJoin(senderUser, eq(ConversationSchema.senderId, senderUser.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, senderUser.id))
      .leftJoin(receiverUser, eq(ConversationSchema.receiverId, receiverUser.id))
      .leftJoin(receiverProfile, eq(receiverProfile.userId, receiverUser.id))
      .where(or(eq(ConversationSchema.senderId, userId), eq(ConversationSchema.receiverId, userId)))
      .orderBy(desc(ConversationSchema.updatedAt))

    const data = result.map((conversation) => {
      const {
        senderUserId,
        senderFirstName,
        senderLastName,
        senderUsername,
        senderAvatar,
        receiverUserId,
        receiverFirstName,
        receiverLastName,
        receiverUsername,
        receiverAvatar,
        ...conversationData
      } = conversation

      return {
        ...conversationData,
        sender: senderUserId
          ? {
              id: senderUserId,
              firstName: senderFirstName,
              lastName: senderLastName,
              username: senderUsername,
              profile: senderAvatar !== null ? { avatar: senderAvatar } : null,
            }
          : null,
        receiver: receiverUserId
          ? {
              id: receiverUserId,
              firstName: receiverFirstName,
              lastName: receiverLastName,
              username: receiverUsername,
              profile: receiverAvatar !== null ? { avatar: receiverAvatar } : null,
            }
          : null,
      }
    })

    return spongRes.json({
      success: true,
      data,
    })
  }

  readonly findOne: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const [result] = await this.db
      .select({
        id: ConversationSchema.id,
        senderId: ConversationSchema.senderId,
        receiverId: ConversationSchema.receiverId,
        lastMessage: ConversationSchema.lastMessage,
        lastMessageSenderId: ConversationSchema.lastMessageSenderId,
        isMutedBySender: ConversationSchema.isMutedBySender,
        isMutedByReceiver: ConversationSchema.isMutedByReceiver,
        createdAt: ConversationSchema.createdAt,
        updatedAt: ConversationSchema.updatedAt,

        senderUserId: senderUser.id,
        senderFirstName: senderUser.firstName,
        senderLastName: senderUser.lastName,
        senderUsername: senderUser.username,
        senderAvatar: senderProfile.avatar,

        receiverUserId: receiverUser.id,
        receiverFirstName: receiverUser.firstName,
        receiverLastName: receiverUser.lastName,
        receiverUsername: receiverUser.username,
        receiverAvatar: receiverProfile.avatar,
      })
      .from(ConversationSchema)
      .leftJoin(senderUser, eq(ConversationSchema.senderId, senderUser.id))
      .leftJoin(senderProfile, eq(senderProfile.userId, senderUser.id))
      .leftJoin(receiverUser, eq(ConversationSchema.receiverId, receiverUser.id))
      .leftJoin(receiverProfile, eq(receiverProfile.userId, receiverUser.id))
      .where(
        and(
          eq(ConversationSchema.id, conversationId),
          or(eq(ConversationSchema.senderId, userId), eq(ConversationSchema.receiverId, userId)),
        ),
      )
      .limit(1)

    if (!result) {
      return spongRes.SpongNotFound({
        success: false,
        message: 'Conversation not found',
      })
    }

    const {
      senderUserId,
      senderFirstName,
      senderLastName,
      senderUsername,
      senderAvatar,
      receiverUserId,
      receiverFirstName,
      receiverLastName,
      receiverUsername,
      receiverAvatar,
      ...conversation
    } = result

    const data = {
      ...conversation,
      sender: senderUserId
        ? {
            id: senderUserId,
            firstName: senderFirstName,
            lastName: senderLastName,
            username: senderUsername,
            profile: senderAvatar !== null ? { avatar: senderAvatar } : null,
          }
        : null,
      receiver: receiverUserId
        ? {
            id: receiverUserId,
            firstName: receiverFirstName,
            lastName: receiverLastName,
            username: receiverUsername,
            profile: receiverAvatar !== null ? { avatar: receiverAvatar } : null,
          }
        : null,
    }

    return spongRes.json({
      success: true,
      data,
    })
  }

  readonly mute: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const conversationId = spongReq.params.id

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Conversation ID is required',
      })
    }

    const [conversation] = await this.db
      .select()
      .from(ConversationSchema)
      .where(
        and(
          eq(ConversationSchema.id, conversationId),
          or(eq(ConversationSchema.senderId, userId), eq(ConversationSchema.receiverId, userId)),
        ),
      )
      .limit(1)

    if (!conversation) {
      return spongRes.SpongNotFound({
        success: false,
        message: 'Conversation not found',
      })
    }

    let isMuted: boolean

    if (conversation.senderId === userId) {
      isMuted = !conversation.isMutedBySender

      await this.db
        .update(ConversationSchema)
        .set({ isMutedBySender: isMuted, updatedAt: new Date() })
        .where(eq(ConversationSchema.id, conversationId))
    } else {
      isMuted = !conversation.isMutedByReceiver

      await this.db
        .update(ConversationSchema)
        .set({ isMutedByReceiver: isMuted, updatedAt: new Date() })
        .where(eq(ConversationSchema.id, conversationId))
    }

    return spongRes.json({
      success: true,
      message: isMuted ? 'Conversation muted successfully' : 'Conversation unmuted successfully',
      data: { isMuted },
    })
  }
}
