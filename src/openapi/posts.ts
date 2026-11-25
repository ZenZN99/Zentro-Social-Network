import { Validator } from 'lykosjs'
import { CreatePostRule } from '../modules/posts/rules/create'
import { UpdatePostRule } from '../modules/posts/rules/update'
import type { OpenAPIRoute } from '@lykosjs/openapi'

export const postsAPI = {
  create: {
    method: 'POST',
    path: '/api/posts',
    summary: 'Create post',
    description:
      'Creates a new post with optional images, mentions, hashtags, and a quoted post. Uploads images to Cloudinary, updates the author posts count, attaches related records, and notifies the author followers.',
    tags: ['Posts'],
    security: ['CookieAuth'],
    request: {
      body: CreatePostRule,
      contentType: 'multipart/form-data',
    },
    response: {
      200: {
        description: 'Post created successfully',
      },
      404: {
        description: 'User or quoted post not found',
      },
      422: {
        description: 'Some mentioned users do not exist',
      },
      500: {
        description: 'Failed to create post',
      },
    },
  },

  findAll: {
    method: 'GET',
    path: '/api/posts',
    summary: 'Get all posts',
    description:
      'Retrieves paginated posts ordered by creation date in descending order. Public posts are visible to everyone. When an authenticated user is provided, their own posts and posts from users they follow with followers-only visibility are also included. Returns author information, profile, and follow relationship data.',
    tags: ['Posts'],
    request: {
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'Posts retrieved successfully',
      },
    },
  },

  findMe: {
    method: 'GET',
    path: '/api/posts/me',
    summary: 'Get my posts',
    description:
      'Retrieves the authenticated user’s posts with author information and profile, ordered by creation date in descending order. Supports pagination.',
    tags: ['Posts'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'User posts retrieved successfully',
      },
    },
  },

  findByUserId: {
    method: 'GET',
    path: '/api/posts/user/:userId',
    summary: 'Get posts by user ID',
    description:
      'Retrieves paginated posts created by a specific user. Public posts are visible to everyone. Followers-only posts are visible to users who follow the target user, while private posts are visible only to the target user. Includes author information, profile, and follow relationship data.',
    tags: ['Posts'],
    request: {
      params: {
        userId: Validator.text().required(),
      },
      query: {
        page: Validator.text().optional(),
        limit: Validator.text().optional(),
      },
    },
    response: {
      200: {
        description: 'User posts retrieved successfully',
      },
      404: {
        description: 'User not found',
      },
    },
  },

  findOne: {
    method: 'GET',
    path: '/api/posts/:postId',
    summary: 'Get post by ID',
    description:
      'Retrieves a specific post with its author information and profile. Private posts are visible only to their authors, while followers-only posts are visible to the author and their followers. Returns not found when the user does not have permission to access the post.',
    tags: ['Posts'],
    request: {
      params: {
        postId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Post retrieved successfully',
      },
      404: {
        description: 'Post not found or user does not have permission to access it',
      },
    },
  },

  update: {
    method: 'PUT',
    path: '/api/posts/:postId',
    summary: 'Update post',
    description:
      'Updates an existing post owned by the authenticated user. Supports updating content, visibility, pin status, appending new images, and synchronizing hashtags and mentions. Existing images are preserved when new images are uploaded.',
    tags: ['Posts'],
    security: ['CookieAuth'],
    request: {
      params: {
        postId: Validator.text().required(),
      },
      body: UpdatePostRule,
      contentType: 'multipart/form-data',
    },
    response: {
      200: {
        description: 'Post updated successfully',
      },
      404: {
        description: 'Post not found',
      },
      422: {
        description: 'Some mentioned users do not exist',
      },
      500: {
        description: 'Failed to update post',
      },
    },
  },

  delete: {
    method: 'DELETE',
    path: '/api/posts/:postId',
    summary: 'Delete post',
    description:
      'Deletes a post owned by the authenticated user, including its mentions, hashtag relations, quote relation, and repost relations. Updates the related counters within a database transaction and deletes associated images from Cloudinary after the transaction succeeds.',
    tags: ['Posts'],
    security: ['CookieAuth'],
    request: {
      params: {
        postId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'Post deleted successfully',
      },
      500: {
        description: 'Failed to delete post',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
