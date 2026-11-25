import type { OpenAPIRoute } from '@lykosjs/openapi'
import { Validator } from 'lykosjs'

export const conversationsAPI = {
  findMe: {
    method: 'GET',
    path: '/api/conversations/me',
    summary: 'Get my conversations',
    description:
      'Retrieves all conversations involving the authenticated user as either the sender or receiver. Each conversation includes its details, sender and receiver information, and their profile avatars. Results are ordered by most recently updated first.',
    tags: ['Conversations'],
    security: ['CookieAuth'],
    response: {
      200: {
        description: 'Conversations retrieved successfully',
      },
    },
  },

  findOne: {
    method: 'GET',
    path: '/api/conversations/:conversationId',
    summary: 'Get conversation by ID',
    description:
      'Retrieves a specific conversation by its ID, including its details, sender and receiver information, and profile avatars. The authenticated user must be either the sender or receiver of the conversation.',
    tags: ['Conversations'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Conversation retrieved successfully',
      },
      400: {
        description: 'Conversation ID is required',
      },
      404: {
        description: 'Conversation not found',
      },
    },
  },

  mute: {
    method: 'PATCH',
    path: '/api/conversations/:conversationId',
    summary: 'Toggle conversation mute',
    description:
      'Toggles the mute status of a conversation for the authenticated user. The sender and receiver have independent mute settings, so changing the mute status only affects the authenticated user. Returns the updated mute status.',
    tags: ['Conversations'],
    security: ['CookieAuth'],
    request: {
      params: {
        conversationId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Conversation muted or unmuted successfully',
      },
      400: {
        description: 'Conversation ID is required',
      },
      404: {
        description: 'Conversation not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
