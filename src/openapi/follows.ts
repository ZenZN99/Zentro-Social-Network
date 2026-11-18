import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'

export const followsAPI = {
  toggle: {
    method: 'POST',
    path: '/api/follows/:followingId',
    summary: 'Toggle user follow',
    description:
      'Toggles the authenticated user’s follow relationship with another user. If a follow relationship already exists, it is removed and both users’ follow counts are decremented. Otherwise, a new follow relationship is created and both users’ follow counts are incremented. Sends a notification to the followed user when a new follow is created.',
    tags: ['Follows'],
    security: ['CookieAuth'],
    request: {
      params: {
        followingId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Follow status toggled successfully',
      },
      400: {
        description: 'You cannot follow yourself',
      },
      404: {
        description: 'User not found',
      },
    },
  },

  findFollowers: {
    method: 'GET',
    path: '/api/follows/followers/:userId',
    summary: 'Get user followers',
    description:
      'Retrieves a paginated list of users who follow the specified user. Each result includes follow information, the follower username and ID, and the follower profile. Results are ordered by creation date, newest first.',
    tags: ['Follows'],
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
        description: 'Followers retrieved successfully',
      },
      404: {
        description: 'User not found',
      },
    },
  },

  findFollowing: {
    method: 'GET',
    path: '/api/follows/following/:userId',
    summary: 'Get user following',
    description:
      'Retrieves a paginated list of users followed by the specified user. Each result includes follow information, the followed username and ID, and the followed user profile. Results are ordered by creation date, newest first.',
    tags: ['Follows'],
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
        description: 'Following list retrieved successfully',
      },
      404: {
        description: 'User not found',
      },
    },
  },

  isFollowing: {
    method: 'GET',
    path: '/api/follows/is-following/:followingId',
    summary: 'Check follow status',
    description:
      'Checks whether the specified follower follows the target user. Returns a boolean indicating the follow relationship status.',
    tags: ['Follows'],
    security: ['CookieAuth'],
    request: {
      params: {
        followingId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Follow status retrieved successfully',
      },
      404: {
        description: 'Target user not found',
      },
    },
  },

  countFollowers: {
    method: 'GET',
    path: '/api/follows/count-followers/:userId',
    summary: 'Count user followers',
    description: 'Returns the total number of users following the specified user.',
    tags: ['Follows'],
    request: {
      params: {
        userId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Followers count retrieved successfully',
      },
      404: {
        description: 'User not found',
      },
    },
  },

  countFollowing: {
    method: 'GET',
    path: '/api/follows/count-following/:userId',
    summary: 'Count user following',
    description: 'Returns the total number of users followed by the specified user.',
    tags: ['Follows'],
    request: {
      params: {
        userId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Following count retrieved successfully',
      },
      404: {
        description: 'User not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
