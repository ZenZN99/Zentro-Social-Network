import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'

export const hashtagsAPI = {
  findTrending: {
    method: 'GET',
    path: '/api/hashtags',
    summary: 'Get trending hashtags',
    description:
      'Retrieves trending hashtags ordered by post count in descending order, with hashtag name as the secondary ascending sort. Supports pagination.',
    tags: ['Hashtags'],
    request: {
      query: {
        page: rules(['nullable', 'string']),
        limit: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description: 'Trending hashtags retrieved successfully',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
