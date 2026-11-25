import type { OpenAPIRoute } from '@lykosjs/openapi'
import { Validator } from 'lykosjs'

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
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'Trending hashtags retrieved successfully',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
