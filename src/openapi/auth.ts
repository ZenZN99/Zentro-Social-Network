import type { OpenAPIRoute } from '@riser-bob/openapi'
import { LoginAuthRule } from '../modules/auth/rules/login'
import { RegisterAuthRule } from '../modules/auth/rules/register'

export const authAPI = {
  register: {
    method: 'POST',
    path: '/api/auth/register',
    summary: 'Register a new user account',
    description:
      'Creates a new user account, initializes its profile, generates authentication tokens, and sets authentication cookies.',
    tags: ['Authentication'],
    request: {
      contentType: 'application/json',
      body: RegisterAuthRule,
    },
    response: {
      201: {
        description: 'Account created successfully.',
      },
      400: {
        description: 'Unable to complete registration. The email may already be registered.',
      },
      422: {
        description: 'Validation failed. One or more registration fields are invalid.',
      },
      500: {
        description: 'Failed to update user after account creation.',
      },
    },
  },

  login: {
    method: 'POST',
    path: '/api/auth/login',
    summary: 'Authenticate a user and create a session',
    description:
      'Authenticates a user using email and password, generates access and refresh tokens, and sets authentication cookies.',
    tags: ['Authentication'],
    request: {
      contentType: 'application/json',
      body: LoginAuthRule,
    },
    response: {
      200: {
        description:
          'Logged in successfully. Returns the authenticated user data and sets access and refresh token cookies.',
      },
      400: {
        description: 'Invalid email or password.',
      },
      422: {
        description: 'Validation failed. One or more login fields are invalid.',
      },
    },
  },
  refreshToken: {
    method: 'POST',
    path: '/api/auth/refreshToken',
    summary: 'Refresh the access token',
    description:
      'Validates the refresh token from the cookies, verifies it against the stored token, and issues a new access token.',
    tags: ['Authentication'],
    response: {
      200: {
        description: 'Access token refreshed successfully. Sets a new access token cookie.',
      },
      401: {
        description:
          'You are not authenticated. The refresh token is missing, invalid, expired, or does not match the stored token.',
      },
    },
  },
  logout: {
    method: 'POST',
    path: '/api/auth/logout',
    summary: 'Log out the current user',
    description:
      'Deletes the access and refresh token cookies to terminate the current client session.',
    tags: ['Authentication'],
    security: ['CookieAuth'],
    response: {
      200: {
        description: 'Logged out successfully. Deletes the access and refresh token cookies.',
      },
    },
  },

  me: {
    method: 'GET',
    path: '/api/auth/me',
    summary: 'Get the authenticated user',
    description:
      'Retrieves the currently authenticated user information, including sanitized user data and profile details.',
    tags: ['Authentication'],
    security: ['CookieAuth'],
    response: {
      200: {
        description: 'Returns the authenticated user data and profile information.',
      },
      401: {
        description: 'You are not authenticated. The user could not be found.',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
