import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'

export const messagesAPI = {
  create: {
    method: 'POST',
    path: '/api/messages/:receiverId',
    summary: 'Send message',
    description:
      'Sends a message to another user with optional file attachments. A message must contain text, attachments, or both. Supports up to 5 attachments. Creates a conversation if one does not already exist, or updates the existing conversation. Uploads attachments to Cloudinary, creates the message, and sends it in real time through the message gateway. A notification is created only when the recipient has not muted the conversation.',
    tags: ['Messages'],
    security: ['CookieAuth'],
    request: {
      contentType: 'multipart/form-data',
      params: {
        receiverId: rules(['required', 'string']),
      },
      body: {
        content: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description: 'Message sent successfully',
      },
      400: {
        description:
          'Message content or attachments are required, maximum 5 attachments allowed, or sender cannot send a message to themselves',
      },
      404: {
        description: 'Message receiver not found',
      },
      500: {
        description: 'Failed to create message',
      },
    },
  },

  findALl: {
    method: 'GET',
    path: '/api/messages/:conversationId',
    summary: 'Get conversation messages',
    description:
      'Retrieves all messages belonging to a conversation accessible to the authenticated user. Each message includes its sender information and profile avatar when available. Messages are ordered by creation date in ascending order.',
    tags: ['Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Conversation messages retrieved successfully',
      },
      404: {
        description: 'Conversation not found',
      },
    },
  },

  markAsRead: {
    method: 'PUT',
    path: '/api/messages/:conversationId',
    summary: 'Mark conversation messages as read',
    description:
      'Marks all unread messages sent by other participants in the specified conversation as read. Updates the updatedAt timestamp and returns the number of messages that were updated.',
    tags: ['Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Messages marked as read successfully',
      },
      404: {
        description: 'Conversation not found',
      },
    },
  },

  findUnreadCount: {
    method: 'GET',
    path: '/api/messages/:conversationId/unread-count',
    summary: 'Get conversation unread messages count',
    description:
      'Retrieves the number of unread messages sent by other participants in the specified conversation. Only messages belonging to the authenticated user’s conversation are counted.',
    tags: ['Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Unread messages count retrieved successfully',
      },
      404: {
        description: 'Conversation not found',
      },
    },
  },

  delete: {
    method: 'DELETE',
    path: '/api/messages/:messageId',
    summary: 'Delete message',
    description:
      'Deletes a message sent by the authenticated user. After deletion, notifies the other conversation participant through the message gateway.',
    tags: ['Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        messageId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Message deleted successfully',
      },
      403: {
        description: 'Forbidden: users can only delete their own messages',
      },
      404: {
        description: 'Message or conversation not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
