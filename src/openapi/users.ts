import { Validator } from 'lykosjs'
import { UserRole } from '../modules/users/schemas/enums/user-role'
import type { OpenAPIRoute } from '@lykosjs/openapi'

export const usersAPI = {
  findAll: {
    method: 'GET',
    path: '/api/users',
    summary: 'Get all users',
    description:
      'Retrieves a paginated list of users, including their sanitized information, profile details, and verification data. Results are ordered by creation date in descending order.',
    tags: ['Users'],
    response: {
      200: {
        description:
          'Returns the list of users with their profile, verification information, and pagination metadata.',
      },
    },
  },

  findOneByUsername: {
    method: 'GET',
    path: '/api/users/:username',
    summary: 'Get a user by username',
    description:
      'Retrieves an active user by username, including sanitized user information, profile details, and verification status.',
    tags: ['Users'],
    response: {
      200: {
        description: 'Returns the user information, including profile and verification details.',
      },
      404: {
        description: 'User not found or the user account is inactive.',
      },
    },
  },

  updateRole: {
    method: 'PATCH',
    path: '/api/users/:userId',
    summary: 'Update a user role',
    description:
      'Updates an active user role to either USER or SUPPORT and sends a notification informing them about the role change.',
    tags: ['Admin'],
    security: ['CookieAuth'],
    request: {
      contentType: 'application/json',
      params: {
        userId: Validator.text().required(),
      },
      body: {
        role: Validator.enum(UserRole).required(),
      },
    },
    response: {
      200: {
        description: 'User role updated successfully. A notification is sent to the user.',
      },
      400: {
        description: 'Invalid user role. Only USER and SUPPORT roles are allowed.',
      },
      404: {
        description: 'User not found or the user account is inactive.',
      },
    },
  },

  block: {
    method: 'DELETE',
    path: '/api/users/:userId',
    summary: 'Block a user',
    description:
      'Blocks a user account using the authenticated administrator identity and the target user ID.',
    tags: ['Admin'],
    security: ['CookieAuth'],
    request: {
      params: {
        userId: Validator.text().required(),
      },
    },
    response: {
      200: {
        description: 'The user block operation was processed successfully.',
      },
      400: {
        description: 'User ID is required.',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
