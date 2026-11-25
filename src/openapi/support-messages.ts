import type { OpenAPIRoute } from "@lykosjs/openapi";
import { Validator } from "lykosjs";


export const supportMessagesAPI = {
  createSupportMessage: {
    method: 'POST',
    path: '/api/support-messages/:conversationId',
    summary: 'Create support message',
    description:
      'Creates a new message in an open support conversation. A message must contain text, attachments, or both. Supports up to 5 attachments.',
    tags: ['Support Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: Validator.text().required(),
      },
      body: {
        message: Validator.text().optional(),
      },
      contentType: 'multipart/form-data',
    },

    response: {
      201: {
        description: 'Support message created successfully',
      },
      400: {
        description:
          'Conversation is closed, more than 5 attachments provided, or message and attachments are both empty',
      },
      404: {
        description: 'Support conversation or support message not found',
      },
      500: {
        description: 'Failed to create support message',
      },
    },
  },

  findAll: {
    method: 'GET',
    path: '/api/support-messages/:conversationId',
    summary: 'Get support conversation messages',
    description:
      'Retrieves all messages belonging to a support conversation, ordered by creation date in ascending order. Each message includes sender information and profile avatar when available.',
    tags: ['Support Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: Validator.text().required(),
      },
    },

    response: {
      200: {
        description: 'Support messages retrieved successfully',
      },
      404: {
        description: 'Support conversation not found',
      },
    },
  },

  markAllAsRead: {
    method: 'PUT',
    path: '/api/support-messages/:conversationId',
    summary: 'Mark all support messages as read',
    description:
      'Marks all unread messages in a support conversation as read and updates their timestamps. Returns the updated messages.',
    tags: ['Support Messages'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: Validator.text().required(),
      },
    },

    response: {
      200: {
        description: 'Support messages marked as read successfully',
      },
      404: {
        description: 'Support conversation not found',
      },
    },
  },

  delete: {
    method: 'DELETE',
    path: '/api/support-messages/:conversationId/:messageId',
    summary: 'Delete support message',
    description:
      'Deletes a support message and its associated attachments from Cloudinary. Image attachments are deleted using the image API, while other files are deleted using the file API.',
    tags: ['Support Messages', 'Admin And Support'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: Validator.text().required(),
        messageId: Validator.text().required(),
      },
    },

    response: {
      200: {
        description: 'Support message deleted successfully',
      },
      404: {
        description: 'Support message not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
