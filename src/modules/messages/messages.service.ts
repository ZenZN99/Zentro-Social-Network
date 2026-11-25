import { and, asc, count, eq, getTableColumns, ne, or } from 'drizzle-orm'
import cloudinary from '../../config/cloudinary/cloudinary'
import type { Database, database } from '../../config/db/drizzle'
import { UserSchema } from '../users/schemas/user.schema'
import { MessageSchema } from './schemas/message.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { ConversationSchema } from '../conversations/schemas/conversation.schema'
import type { FormDataEntryValue } from 'bun'
import type { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../notifications/schemas/enums/notification-type'
import type { MessagesGateway } from '../../config/gateways/messages.gateway'
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from 'lykosjs'

export class MessagesService {
  constructor(
    private readonly db: Database,
    private readonly messageGateway: MessagesGateway,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    senderId: string,
    receiverId: string,
    formData: {
      get: (name: string) => FormDataEntryValue | null
      getAll: (name: string) => FormDataEntryValue[]
    },
  ) {
    const content = formData.get('content')

    const text = typeof content === 'string' ? content.trim() || null : null

    const files = formData.getAll('files').filter((file): file is File => file instanceof File)

    if (!text && files.length === 0) {
      throw new BadRequestException({
        success: false,
        message: 'Message content or attachments are required',
      })
    }

    if (files.length > 5) {
      throw new BadRequestException({
        success: false,
        message: 'Maximum 5 attachments are allowed',
      })
    }

    if (senderId === receiverId) {
      throw new BadRequestException({
        success: false,
        message: 'You cannot send a message to yourself',
      })
    }

    const [receiver] = await this.db.connection
      .select({ id: UserSchema.id })
      .from(UserSchema)
      .where(eq(UserSchema.id, receiverId))
      .limit(1)

    if (!receiver) {
      throw new NotFoundException({
        success: false,
        message: 'Message receiver not found',
      })
    }

    const attachments: string[] = []
    const uploadedAttachments: {
      publicId: string
      type: 'image' | 'file'
    }[] = []

    try {
      for (const file of files) {
        const isImage = file.type.startsWith('image/')

        const uploaded = isImage
          ? await cloudinary.images.uploadImage(file, 'zentro/messages')
          : await cloudinary.files.uploadFile(file, 'zentro/messages')

        attachments.push(uploaded.url)

        uploadedAttachments.push({
          publicId: uploaded.publicId,
          type: isImage ? 'image' : 'file',
        })
      }

      const lastMessage = text ?? (attachments.length > 0 ? 'Attachment' : '')

      const result = await this.db.connection.transaction(async (tx) => {
        let [conversation] = await tx
          .select()
          .from(ConversationSchema)
          .where(
            or(
              and(
                eq(ConversationSchema.senderId, senderId),
                eq(ConversationSchema.receiverId, receiverId),
              ),
              and(
                eq(ConversationSchema.senderId, receiverId),
                eq(ConversationSchema.receiverId, senderId),
              ),
            ),
          )
          .limit(1)

        if (!conversation) {
          const [newConversation] = await tx
            .insert(ConversationSchema)
            .values({
              senderId,
              receiverId,
              lastMessage,
              lastMessageSenderId: senderId,
            })
            .returning()

          conversation = newConversation
        } else {
          const [updatedConversation] = await tx
            .update(ConversationSchema)
            .set({
              lastMessage,
              lastMessageSenderId: senderId,
              updatedAt: new Date(),
            })
            .where(eq(ConversationSchema.id, conversation.id))
            .returning()

          conversation = updatedConversation
        }

        const [message] = await tx
          .insert(MessageSchema)
          .values({
            userId: senderId,
            conversationId: conversation!.id,
            content: text,
            attachments,
            isRead: false,
          })
          .returning()

        if (!message) {
          throw new InternalServerErrorException({
            success: false,
            message: 'Failed to create message',
          })
        }

        return tx
          .select({
            ...getTableColumns(MessageSchema),

            userFirstName: UserSchema.firstName,
            userLastName: UserSchema.lastName,
            userUsername: UserSchema.username,
            userAvatar: UserProfileSchema.avatar,

            conversationSenderId: ConversationSchema.senderId,
            conversationReceiverId: ConversationSchema.receiverId,
            conversationLastMessage: ConversationSchema.lastMessage,
            conversationLastMessageSenderId: ConversationSchema.lastMessageSenderId,
            conversationIsMutedBySender: ConversationSchema.isMutedBySender,
            conversationIsMutedByReceiver: ConversationSchema.isMutedByReceiver,
            conversationCreatedAt: ConversationSchema.createdAt,
            conversationUpdatedAt: ConversationSchema.updatedAt,
          })
          .from(MessageSchema)
          .leftJoin(UserSchema, eq(MessageSchema.userId, UserSchema.id))
          .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
          .innerJoin(ConversationSchema, eq(MessageSchema.conversationId, ConversationSchema.id))
          .where(eq(MessageSchema.id, message.id))
          .limit(1)
          .then(([row]) => row)
      })

      if (!result) {
        throw new InternalServerErrorException({
          success: false,
          message: 'Failed to create message',
        })
      }

      const {
        userFirstName,
        userLastName,
        userUsername,
        userAvatar,

        conversationSenderId,
        conversationReceiverId,
        conversationLastMessage,
        conversationLastMessageSenderId,
        conversationIsMutedBySender,
        conversationIsMutedByReceiver,
        conversationCreatedAt,
        conversationUpdatedAt,

        ...message
      } = result

      const fullMessage = {
        ...message,

        user: {
          firstName: userFirstName,
          lastName: userLastName,
          username: userUsername,
          profile: userAvatar ? { avatar: userAvatar } : null,
        },

        conversation: {
          id: message.conversationId,
          senderId: conversationSenderId,
          receiverId: conversationReceiverId,
          lastMessage: conversationLastMessage,
          lastMessageSenderId: conversationLastMessageSenderId,
          isMutedBySender: conversationIsMutedBySender,
          isMutedByReceiver: conversationIsMutedByReceiver,
          createdAt: conversationCreatedAt,
          updatedAt: conversationUpdatedAt,
        },
      }

      const isMuted =
        fullMessage.conversation.senderId === receiverId
          ? fullMessage.conversation.isMutedBySender
          : fullMessage.conversation.isMutedByReceiver

      if (!isMuted) {
        await this.notificationsService.create({
          senderId,
          receiverId,
          targetId: fullMessage.id,
          type: NotificationType.MESSAGE,
          message: `${fullMessage.user.firstName} sent you a message.`,
          link: `/conversations/${fullMessage.conversationId}`,
        })
      }

      this.messageGateway.sendMessage({
        receiverId,
        message,
      })

      return {
        success: true,
        message: 'Message sent successfully',
        data: fullMessage,
      }
    } catch (error) {
      await Promise.allSettled(
        uploadedAttachments.map(({ publicId, type }) =>
          type === 'image'
            ? cloudinary.images.destroyImage(publicId)
            : cloudinary.files.destroyFile(publicId),
        ),
      )

      throw error
    }
  }

  async findAll(userId: string, conversationId: string) {
    const [conversation] = await this.db.connection
      .select({ id: ConversationSchema.id })
      .from(ConversationSchema)
      .where(
        and(
          eq(ConversationSchema.id, conversationId),
          or(eq(ConversationSchema.senderId, userId), eq(ConversationSchema.receiverId, userId)),
        ),
      )
      .limit(1)

    if (!conversation) {
      throw new NotFoundException({
        success: false,
        message: 'Conversation not found',
      })
    }

    const result = await this.db.connection
      .select({
        ...getTableColumns(MessageSchema),

        user: {
          id: UserSchema.id,
          firstName: UserSchema.firstName,
          lastName: UserSchema.lastName,
          username: UserSchema.username,
        },

        userAvatar: UserProfileSchema.avatar,
      })
      .from(MessageSchema)
      .leftJoin(UserSchema, eq(MessageSchema.userId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .where(eq(MessageSchema.conversationId, conversationId))
      .orderBy(asc(MessageSchema.createdAt))

    const messages = result.map(({ userAvatar, ...message }) => ({
      ...message,
      user: message.user
        ? {
            ...message.user,
            profile: userAvatar !== null ? { avatar: userAvatar } : null,
          }
        : null,
    }))

    return {
      success: true,
      data: messages,
    }
  }

  async markAllAsRead(userId: string, conversationId: string) {
    const [conversation] = await this.db.connection
      .select({ id: ConversationSchema.id })
      .from(ConversationSchema)
      .where(
        and(
          eq(ConversationSchema.id, conversationId),
          or(eq(ConversationSchema.senderId, userId), eq(ConversationSchema.receiverId, userId)),
        ),
      )
      .limit(1)

    if (!conversation) {
      throw new NotFoundException({
        success: false,
        message: 'Conversation not found',
      })
    }

    const updatedMessages = await this.db.connection
      .update(MessageSchema)
      .set({
        isRead: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(MessageSchema.conversationId, conversationId),
          ne(MessageSchema.userId, userId),
          eq(MessageSchema.isRead, false),
        ),
      )
      .returning({ id: MessageSchema.id })

    const updatedCount = updatedMessages.length

    return {
      success: true,
      message: 'Messages marked as read successfully',
      data: updatedCount,
    }
  }

  async findUnreadCount(userId: string, conversationId: string) {
    const [conversation] = await this.db.connection
      .select({ id: ConversationSchema.id })
      .from(ConversationSchema)
      .where(
        and(
          eq(ConversationSchema.id, conversationId),
          or(eq(ConversationSchema.senderId, userId), eq(ConversationSchema.receiverId, userId)),
        ),
      )
      .limit(1)

    if (!conversation) {
      throw new NotFoundException({
        success: false,
        message: 'Conversation not found',
      })
    }

    const [result] = await this.db.connection
      .select({
        unreadCount: count(),
      })
      .from(MessageSchema)
      .where(
        and(
          eq(MessageSchema.conversationId, conversationId),
          ne(MessageSchema.userId, userId),
          eq(MessageSchema.isRead, false),
        ),
      )

    return {
      success: true,
      data: result?.unreadCount ?? 0,
    }
  }
  async delete(userId: string, messageId: string) {
    const [message] = await this.db.connection
      .select()
      .from(MessageSchema)
      .where(eq(MessageSchema.id, messageId))
      .limit(1)

    if (!message) {
      throw new NotFoundException({
        success: false,
        message: 'Message not found',
      })
    }

    if (message.userId !== userId) {
      throw new ForbiddenException({
        success: false,
        message: 'Forbidden',
      })
    }

    const [conversation] = await this.db.connection
      .select()
      .from(ConversationSchema)
      .where(eq(ConversationSchema.id, message.conversationId))
      .limit(1)

    if (!conversation) {
      throw new NotFoundException({
        success: false,
        message: 'Conversation not found',
      })
    }

    const receiverId =
      conversation.senderId === userId ? conversation.receiverId : conversation.senderId

    await this.db.connection.delete(MessageSchema).where(eq(MessageSchema.id, messageId))

    this.messageGateway.sendMessageDeleted({
      receiverId,
      messageId: message.id,
    })

    return {
      success: true,
      message: 'Message deleted successfully',
    }
  }
}
