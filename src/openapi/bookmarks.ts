import type { OpenAPIRoute } from '@lykosjs/openapi'
import { Validator } from 'lykosjs'

export const bookmarksAPI = {
  toggle: {
    method: 'POST',
    path: '/api/bookmarks/:postId',
    summary: 'Toggle post bookmark',
    description:
      'Toggles the authenticated user bookmark status for a post. If the post is already bookmarked, removes the bookmark and decrements the post bookmarks count. Otherwise, creates a bookmark and increments the count. The operation is performed within a database transaction.',
    tags: ['Bookmarks'],
    security: ['CookieAuth'],
    request: {
      params: {
        postId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Post bookmarked or bookmark removed successfully',
      },
      404: {
        description: 'Post not found',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/bookmarks/me',
    summary: 'Get my bookmarks',
    description:
      'Retrieves a paginated list of bookmarks created by the authenticated user. Each bookmark includes its bookmark data and the associated post with its author information and profile. If the bookmarked post no longer exists, the post field is returned as null. Results are ordered by bookmark creation date, newest first.',
    tags: ['Bookmarks'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'User bookmarks retrieved successfully',
      },
    },
  },

  isBookmarked: {
    method: 'GET',
    path: '/api/bookmarks/is-bookmarked/:postId',
    summary: 'Check post bookmark status',
    description:
      'Checks whether the authenticated user has bookmarked the specified post. Returns a boolean indicating whether the bookmark exists.',
    tags: ['Bookmarks'],
    security: ['CookieAuth'],
    request: {
      params: {
        postId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Bookmark status retrieved successfully',
      },
    },
  },

  countByPostId: {
    method: 'GET',
    path: '/api/bookmarks/count/:postId',
    summary: 'Count post bookmarks',
    description:
      'Retrieves the total number of bookmarks saved for a specific post. Checks whether the post exists before returning its bookmarks count.',
    tags: ['Bookmarks'],
    request: {
      params: {
        postId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Post bookmarks count retrieved successfully',
      },
      404: {
        description: 'Post not found',
      },
    },
  },

  countMe: {
    method: 'GET',
    path: '/api/bookmarks/count/me',
    summary: 'Count my bookmarks',
    description: 'Returns the total number of bookmarks created by the authenticated user.',
    tags: ['Bookmarks'],
    security: ['CookieAuth'],
    response: {
      200: {
        description: 'User bookmarks count retrieved successfully',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
