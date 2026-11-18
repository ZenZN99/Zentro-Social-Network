import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'

export const repostsAPI = {
  repostPost: {
    method: 'POST',
    path: '/api/reposts/:postId',
    summary: 'Repost a post',
    description:
      'Reposts an existing post if the authenticated user has permission to access it. Prevents duplicate reposts, increments the original post reposts count, and sends a notification to the original author.',
    tags: ['Reposts'],
    security: ['CookieAuth'],
    request: {
      params: {
        postId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Post reposted successfully',
      },
      403: {
        description: 'You are not allowed to repost this post',
      },
      404: {
        description: 'Post not found',
      },
      409: {
        description: 'You have already reposted this post',
      },
    },
  },

  findByUserId: {
    method: 'GET',
    path: '/api/reposts/:userId',
    summary: 'Get user reposts',
    description:
      'Retrieves paginated reposts created by a specific user, including the repost information, original post, original post author, and author profile. Reposts are ordered by creation date in descending order.',
    tags: ['Reposts'],
    request: {
      params: {
        userId: rules(['required', 'string']),
      },
      query: {
        page: rules(['nullable', 'string']),
        limit: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description: 'User reposts retrieved successfully',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/reposts/me',
    summary: 'Get my reposts',
    description:
      'Retrieves the authenticated user’s reposts with the original post, its author information, and profile. Reposts are ordered by creation date in descending order. Supports pagination.',
    tags: ['Post Reposts'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: rules(['nullable', 'string']),
        limit: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description: 'User reposts retrieved successfully',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
