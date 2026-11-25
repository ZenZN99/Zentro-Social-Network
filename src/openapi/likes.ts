import type { OpenAPIRoute } from '@lykosjs/openapi'
import { Validator } from 'lykosjs'

export const likesAPI = {
  toggle: {
    method: 'POST',
    path: '/api/likes/:targetType/:targetId',
    summary: 'Toggle like',
    description:
      'Toggles the authenticated user’s like on a post, comment, or reply. If the user has already liked the target, the like is removed and the likes count is decremented. Otherwise, a new like is created and the likes count is incremented. Sends a notification to the target owner on the first like and every 25 likes milestone, excluding self-likes.',
    tags: ['Likes'],
    security: ['CookieAuth'],
    request: {
      params: {
        targetType: Validator.text().required(),
        targetId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Like toggled successfully',
      },
      400: {
        description: 'Invalid target type',
      },
      401: {
        description: 'User is not authenticated',
      },
      404: {
        description: 'Target post, comment, or reply not found',
      },
      500: {
        description: 'Failed to update likes count',
      },
    },
  },

  findAll: {
    method: 'GET',
    path: '/api/likes/:targetType/:targetId',
    summary: 'Get target likes',
    description:
      'Retrieves paginated likes for a post, comment, or reply. Each like includes the associated user information and profile. Likes are ordered by creation date in descending order.',
    tags: ['Likes'],
    request: {
      params: {
        targetType: Validator.text().required(),
        targetId: Validator.text().required(),
      },
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'Target likes retrieved successfully',
      },
      400: {
        description: 'Invalid target type',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/likes/me/:targetType/:targetId',
    summary: 'Get my likes on target',
    description:
      'Retrieves the authenticated user’s likes for a specific post, comment, or reply. Each result includes the like information, user details, and profile. Results are ordered by creation date in descending order and support pagination.',
    tags: ['Likes'],
    security: ['CookieAuth'],
    request: {
      params: {
        targetType: Validator.text().required(),
        targetId: Validator.text().required(),
      },
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'User target likes retrieved successfully',
      },
      400: {
        description: 'Invalid target type',
      },
    },
  },

  count: {
    method: 'GET',
    path: '/api/likes/count/:targetType/:targetId',
    summary: 'Get target likes count',
    description: 'Retrieves the total number of likes for a specific post, comment, or reply.',
    tags: ['Likes'],
    request: {
      params: {
        targetType: Validator.text().required(),
        targetId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Target likes count retrieved successfully',
      },
      400: {
        description: 'Invalid target type',
      },
      404: {
        description: 'Target post, comment, or reply not found',
      },
    },
  },

  isLiked: {
    method: 'GET',
    path: '/api/likes/is-liked/:targetType/:targetId',
    summary: 'Check if target is liked',
    description:
      'Checks whether the authenticated user has liked a specific post, comment, or reply. Returns a boolean indicating the like status.',
    tags: ['Likes'],
    security: ['CookieAuth'],
    request: {
      params: {
        targetType: Validator.text().required(),
        targetId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Like status retrieved successfully',
      },
      400: {
        description: 'Invalid target type',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
