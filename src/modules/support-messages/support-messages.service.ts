import type { database } from '../../config/db/drizzle'
import {
  SupportConversationSchema,
  type SupportConversation,
} from '../support-conversations/schemas/support-conversation.schema'
import { UserRole } from '../users/schemas/enums/user-role'
import { UserSchema, type User } from '../users/schemas/user.schema'
import { SupportMessageSchema } from './schemas/support-message.schema'
import { UserProfileSchema } from '../user-profiles/schemas/user-profile.schema'
import { and, asc, eq, getTableColumns } from 'drizzle-orm'
import { SupportConversationStatus } from '../support-conversations/schemas/enums/status'
import cloudinary from '../../config/cloudinary/cloudinary'
import type { FormDataEntryValue } from 'bun'
import {
  SpongBadRequestException,
  SpongInternalServerErrorException,
  SpongNotFoundException,
} from 'riser-bob'

export type SupportAttachment = {
  url: string
  type: 'image' | 'file'
  name: string
}

export class SupportMessagesService {
  constructor(private readonly db: typeof database) {}

  private authorizeConversation(conversation: SupportConversation, currentUser: User) {
    const isStaff = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.SUPPORT

    if (!isStaff && conversation.userId !== currentUser.id) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Support conversation not found',
      })
    }
  }

  async create(
    currentUser: User,
    conversationId: string,
    formData: {
      get(name: string): FormDataEntryValue | null
      getAll(name: string): FormDataEntryValue[]
    },
  ) {
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

    this.authorizeConversation(conversation, currentUser)

    if (conversation.status !== SupportConversationStatus.OPEN) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Support conversation is closed',
      })
    }

    const message = formData.get('message') as string | null
    const files = formData.getAll('files') as File[]

    if (files.length > 5) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Maximum 5 attachments are allowed',
      })
    }

    if (!message?.trim() && files.length === 0) {
      throw new SpongBadRequestException({
        success: false,
        message: 'Message cannot be empty',
      })
    }

    const attachments: SupportAttachment[] = []

    for (const file of files) {
      const isImage = file.type.startsWith('image/')

      const uploaded = isImage
        ? await cloudinary.images.uploadImage(file, 'support-messages/attachments')
        : await cloudinary.files.uploadFile(file, 'support-messages/attachments')

      attachments.push({
        url: uploaded.url,
        type: isImage ? 'image' : 'file',
        name: file.name,
      })
    }

    const [supportMessage] = await this.db
      .insert(SupportMessageSchema)
      .values({
        conversationId,
        senderId: currentUser.id,
        message: message?.trim() || null,
        attachments,
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    if (!supportMessage) {
      throw new SpongInternalServerErrorException({
        success: false,
        message: 'Failed to create support message',
      })
    }

    await this.db
      .update(SupportConversationSchema)
      .set({
        lastMessage: message?.trim() || 'Attachment',
        lastMessageSenderId: currentUser.id,
        updatedAt: new Date(),
      })
      .where(eq(SupportConversationSchema.id, conversationId))

    const [fullMessage] = await this.db
      .select({
        ...getTableColumns(SupportMessageSchema),

        senderId: UserSchema.id,
        senderFirstName: UserSchema.firstName,
        senderLastName: UserSchema.lastName,
        senderRole: UserSchema.role,

        profileId: UserProfileSchema.id,
        profileAvatar: UserProfileSchema.avatar,
      })
      .from(SupportMessageSchema)
      .leftJoin(UserSchema, eq(SupportMessageSchema.senderId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .where(eq(SupportMessageSchema.id, supportMessage.id))
      .limit(1)

    if (!fullMessage) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Support message not found',
      })
    }

    const {
      senderId,
      senderFirstName,
      senderLastName,
      senderRole,
      profileId,
      profileAvatar,
      ...messageData
    } = fullMessage

    const result = {
      ...messageData,
      sender: senderId
        ? {
            id: senderId,
            firstName: senderFirstName,
            lastName: senderLastName,
            role: senderRole,
            profile: profileId ? { avatar: profileAvatar } : null,
          }
        : null,
    }

    return {
      success: true,
      message: 'Support message created successfully',
      data: result,
    }
  }

  async findAll(currentUser: User, conversationId: string) {
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

    this.authorizeConversation(conversation, currentUser)

    const supportMessages = await this.db
      .select({
        ...getTableColumns(SupportMessageSchema),
        senderId: UserSchema.id,
        senderFirstName: UserSchema.firstName,
        senderLastName: UserSchema.lastName,
        senderEmail: UserSchema.email,
        senderRole: UserSchema.role,
        senderAvatar: UserProfileSchema.avatar,
      })
      .from(SupportMessageSchema)
      .leftJoin(UserSchema, eq(SupportMessageSchema.senderId, UserSchema.id))
      .leftJoin(UserProfileSchema, eq(UserProfileSchema.userId, UserSchema.id))
      .where(eq(SupportMessageSchema.conversationId, conversationId))
      .orderBy(asc(SupportMessageSchema.createdAt))

    const result = supportMessages.map((message) => {
      const {
        senderId,
        senderFirstName,
        senderLastName,
        senderEmail,
        senderRole,
        senderAvatar,
        ...supportMessage
      } = message

      return {
        ...supportMessage,
        sender: senderId
          ? {
              id: senderId,
              firstName: senderFirstName,
              lastName: senderLastName,
              email: senderEmail,
              role: senderRole,
              profile: senderAvatar !== null ? { avatar: senderAvatar } : null,
            }
          : null,
      }
    })

    return {
      success: true,
      data: result,
    }
  }

  async markAllAsRead(currentUser: User, conversationId: string) {
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

    this.authorizeConversation(conversation, currentUser)

    const updatedMessages = await this.db
      .update(SupportMessageSchema)
      .set({
        isRead: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(SupportMessageSchema.conversationId, conversationId),
          eq(SupportMessageSchema.isRead, false),
        ),
      )
      .returning()

    return {
      success: true,
      message: 'Support messages marked as read successfully',
      data: updatedMessages,
    }
  }

  async delete(conversationId: string, messageId: string) {
    const [supportMessage] = await this.db
      .select()
      .from(SupportMessageSchema)
      .where(
        and(
          eq(SupportMessageSchema.id, messageId),
          eq(SupportMessageSchema.conversationId, conversationId),
        ),
      )
      .limit(1)

    if (!supportMessage) {
      throw new SpongNotFoundException({
        success: false,
        message: 'Support message not found',
      })
    }

    for (const attachment of supportMessage.attachments) {
      if (attachment.type === 'image') {
        await cloudinary.images.destroyImage(attachment.url)
      } else {
        await cloudinary.files.destroyFile(attachment.url)
      }
    }
    await this.db.delete(SupportMessageSchema).where(eq(SupportMessageSchema.id, messageId))

    return {
      success: true,
      message: 'Support message deleted successfully',
    }
  }
}
