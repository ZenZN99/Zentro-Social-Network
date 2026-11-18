import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'
import { UpdateCommentRule } from '../modules/comments/rules/update'
import { CreateCommentRule } from '../modules/comments/rules/create'

export const commentsAPI = {
  create: {
    method: 'POST',
    path: '/api/comments/:postId',
    summary: 'Create comment',
    description:
      'Creates a comment on an existing post. Updates the post comments count and the authenticated user comments count within a database transaction. Sends a notification to the post owner when another user comments on their post. Notification failures do not affect comment creation.',
    tags: ['Comments'],
    security: ['CookieAuth'],
    request: {
      params: {
        postId: rules(['required', 'string']),
      },
      body: CreateCommentRule,
    },
    response: {
      200: {
        description: 'Comment created successfully',
      },
      404: {
        description: 'Post not found',
      },
    },
  },

  findAll: {
    method: 'GET',
    path: '/api/comments/:postId/all',
    summary: 'Get post comments',
    description:
      'Retrieves a paginated list of comments belonging to a specific post. Each comment includes the comment data, author ID and username, and author profile. Results are ordered by creation date, newest first.',
    tags: ['Comments'],
    request: {
      params: {
        postId: rules(['required', 'string']),
      },
      query: {
        page: rules(['nullable', 'string']),
        limit: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description: 'Comments retrieved successfully',
      },
      404: {
        description: 'Post not found',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/comments/me',
    summary: 'Get my comments',
    description:
      'Retrieves a paginated list of comments created by the authenticated user. Each comment includes the comment data, author ID and username, and author profile. Results are ordered by creation date, newest first.',
    tags: ['Comments'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: rules(['nullable', 'string']),
        limit: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description: 'User comments retrieved successfully',
      },
    },
  },

  findOne: {
    method: 'GET',
    path: '/api/comments/:commentId',
    summary: 'Get comment by ID',
    description:
      'Retrieves a specific comment by its ID, including the comment data, author ID and username, and author profile.',
    tags: ['Comments'],
    request: {
      params: {
        commentId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Comment retrieved successfully',
      },
      404: {
        description: 'Comment not found',
      },
    },
  },

  update: {
    method: 'PUT',
    path: '/api/comments/:commentId',
    summary: 'Update comment',
    description:
      'Updates the content of an existing comment. Only the comment owner is allowed to edit it. Marks the comment as edited and updates its modification timestamp.',
    tags: ['Comments'],
    security: ['CookieAuth'],
    request: {
      params: {
        commentId: rules(['required', 'string']),
      },
      body: UpdateCommentRule,
    },
    response: {
      200: {
        description: 'Comment updated successfully',
      },
      403: {
        description: 'You are not allowed to edit this comment',
      },
      404: {
        description: 'Comment not found',
      },
    },
  },

  delete: {
    method: 'DELETE',
    path: '/api/comments/:commentId',
    summary: 'Delete comment',
    description:
      'Deletes an existing comment and all replies belonging to it within a database transaction. Only the comment owner is allowed to delete it. Also decrements the associated post comments count, the comment author comments count, and each reply author replies count.',
    tags: ['Comments'],
    security: ['CookieAuth'],
    request: {
      params: {
        commentId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Comment and all its replies deleted successfully',
      },
      403: {
        description: 'You are not allowed to delete this comment',
      },
      404: {
        description: 'Comment not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
