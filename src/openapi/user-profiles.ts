import type { OpenAPIRoute } from '@lykosjs/openapi'
import { UpdateUserProfileRule } from '../modules/user-profiles/rules/update'

export const userProfilesAPI = {
  update: {
    method: 'PUT',
    path: '/api/user-profiles',
    summary: 'Update the authenticated user profile',
    description:
      'Updates the authenticated user profile, including biography, website, social media links, avatar, cover image, and privacy settings. Images are uploaded to Cloudinary. Existing images are replaced after the database update succeeds.',
    tags: ['User Profiles'],
    security: ['CookieAuth'],
    request: {
      contentType: 'multipart/form-data',
      body: UpdateUserProfileRule,
    },
    response: {
      200: {
        description:
          'Profile updated successfully. Returns the updated avatar, cover, biography, social links, website, and privacy status.',
      },
      404: {
        description: 'Profile not found.',
      },
      422: {
        description:
          'Validation failed. May include invalid text fields, unsupported image formats, images exceeding 5 MB, or invalid social media URLs.',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
