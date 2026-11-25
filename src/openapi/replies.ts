import { Validator } from 'lykosjs'
import { CreateReplyRule } from '../modules/replies/rules/create'
import { UpdateReplyRule } from '../modules/replies/rules/update'
import type { OpenAPIRoute } from '@lykosjs/openapi'

export const repliesAPI = {
  create: {
    method: 'POST',
    path: '/api/replies/:commentId',
    summary: 'Create reply',
    description:
      'Creates a reply to a comment. Supports nested replies by providing an optional parentReplyId. Updates the comment, post, and user profile reply counters. Sends a notification to the comment owner when another user replies.',
    tags: ['Replies'],

    security: ['CookieAuth'],

    request: {
      params: {
        commentId: Validator.text().required(),
      },
      body: CreateReplyRule,
    },

    response: {
      201: {
        description: 'Reply created successfully',
      },
      404: {
        description: 'Comment, user, or parent reply not found',
      },
      500: {
        description: 'Failed to create reply',
      },
    },
  },

  findAll: {
    method: 'GET',
    path: '/api/replies/:commentId/all',
    summary: 'Get comment replies',
    description:
      'Retrieves paginated replies for a specific comment, including the reply author information and profile. Replies are ordered by creation date in descending order.',
    tags: ['Replies'],
    request: {
      params: {
        commentId: Validator.text().required(),
      },
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'Replies retrieved successfully',
      },
      404: {
        description: 'Comment not found',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/replies/me',
    summary: 'Get my replies',
    description:
      'Retrieves the authenticated user’s replies with author information and profile, ordered by creation date in descending order. Supports pagination.',
    tags: ['Replies'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'User replies retrieved successfully',
      },
    },
  },

  findOne: {
    method: 'GET',
    path: '/api/replies/:replyId',
    summary: 'Get reply by ID',
    description:
      'Retrieves a specific reply by its ID, including the reply author information and profile.',
    tags: ['Replies'],
    request: {
      params: {
        replyId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Reply retrieved successfully',
      },
      404: {
        description: 'Reply not found',
      },
    },
  },

  update: {
    method: 'PUT',
    path: '/api/replies/:replyId',
    summary: 'Update reply',
    description:
      'Updates the content of an existing reply. Only the user who created the reply is allowed to edit it. Marks the reply as edited and updates its timestamp.',
    tags: ['Replies'],
    security: ['CookieAuth'],
    request: {
      params: {
        replyId: Validator.text().required(),
      },
      body: UpdateReplyRule,
    },
    response: {
      200: {
        description: 'Reply updated successfully',
      },
      403: {
        description: 'You are not allowed to edit this reply',
      },
      404: {
        description: 'Reply not found',
      },
    },
  },

  delete: {
    method: 'DELETE',
    path: '/api/replies/:replyId',
    summary: 'Delete reply',
    description:
      'Deletes an existing reply. Only the reply author is allowed to delete it. Also decrements the comment replies count, post comments count, and reply author replies count within a database transaction.',
    tags: ['Replies'],
    security: ['CookieAuth'],
    request: {
      params: {
        replyId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Reply deleted successfully',
      },
      403: {
        description: 'You are not allowed to delete this reply',
      },
      404: {
        description: 'Reply or comment not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
