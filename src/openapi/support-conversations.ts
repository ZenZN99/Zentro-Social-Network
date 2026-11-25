import type { OpenAPIRoute } from '@lykosjs/openapi'
import { Validator } from 'lykosjs'

export const supportConversationsAPI = {
  create: {
    method: 'POST',
    path: '/api/support-conversations',
    summary: 'Create support conversation',
    description:
      'Creates a new support conversation for the authenticated user. A user cannot have more than one open support conversation at a time.',
    tags: ['Support Conversations'],
    security: ['CookieAuth'],

    response: {
      201: {
        description: 'Support conversation created successfully',
      },
      400: {
        description: 'User already has an open support conversation',
      },
      401: {
        description: 'User is not authenticated',
      },
    },
  },

  findAll: {
    method: 'GET',
    path: '/api/support-conversations',
    summary: 'Get all support conversations',
    description:
      'Retrieves support conversations with associated user profiles, last message sender, and the user who closed each conversation. Results are ordered by most recently updated, with pagination support.',
    tags: ['Support Conversations', 'Admin And Support'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },

    response: {
      200: {
        description: 'Support conversations retrieved successfully',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/support-conversations/me',
    summary: 'Get my support conversations',
    description:
      'Retrieves all support conversations belonging to the authenticated user, including user profile information and last message sender details. Results are ordered by most recently updated.',
    tags: ['Support Conversations'],

    security: ['CookieAuth'],

    response: {
      200: {
        description: 'User support conversations retrieved successfully',
      },
    },
  },

  findOne: {
    method: 'GET',
    path: '/api/support-conversations/:conversationId',
    summary: 'Get support conversation',
    description:
      'Retrieves a specific support conversation with its associated user profile, last message sender, and the user who closed it. Admin and support users can access any conversation, while regular users can only access their own conversations.',
    tags: ['Support Conversations'],
    security: ['CookieAuth'],

    request: {
      params: {
        conversationId: Validator.text().required(),
      },
    },

    response: {
      200: {
        description: 'Support conversation retrieved successfully',
      },
      401: {
        description: 'User is not authenticated',
      },
      404: {
        description: 'Support conversation not found',
      },
    },
  },

  toggle: {
    method: 'PUT',
    path: '/api/support-conversations/:conversationId',
    summary: 'Toggle support conversation status',
    description:
      'Toggles a support conversation between OPEN and CLOSED. When closing a conversation, records the closing timestamp and admin ID. When reopening it, clears the closing timestamp and admin ID.',
    tags: ['Support Conversations', 'Admin'],
    security: ['CookieAuth'],

    request: {
      params: {
        conversationId: Validator.text().required(),
      },
    },

    response: {
      200: {
        description: 'Support conversation status updated successfully',
      },
      404: {
        description: 'Support conversation not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
