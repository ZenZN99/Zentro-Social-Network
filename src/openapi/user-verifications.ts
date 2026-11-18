import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'
import { UpdateUserVerificationRule } from '../modules/user-verifications/rules/update'

export const userVerficationsAPI = {
  create: {
    method: 'POST',
    path: '/api/user-verifications',
    summary: 'Submit an identity verification request',
    description:
      'Submits a new identity verification request or resubmits a previously rejected request. Uploads a profile image and an identity document, then notifies all administrators about the submission.',
    tags: ['User Verifications'],
    security: ['CookieAuth'],
    request: {
      contentType: 'multipart/form-data',
      body: {
        profileImage: rules(['required', 'string']),
        identityDocument: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description:
          'Verification request submitted or resubmitted successfully. Returns the verification record and its operation type.',
      },
      400: {
        description:
          'A verification request is already pending review, or the account has already been verified.',
      },
    },
  },

  findPending: {
    method: 'GET',
    path: '/api/user-verifications/pending',
    summary: 'Get pending verification requests',
    description:
      'Retrieves paginated pending identity verification requests, ordered by submission date in ascending order. Each request includes the associated user information and profile details.',
    tags: ['User Verifications'],
    security: ['CookieAuth'],
    request: {
      query: {
        page: rules(['nullable', 'string']),
        limit: rules(['nullable', 'string']),
        offset: rules(['nullable', 'string']),
      },
    },
    response: {
      200: {
        description:
          'Returns pending verification requests with associated user and profile information, along with pagination metadata.',
      },
    },
  },

  update: {
    method: 'PATCH',
    path: '/api/user-verifications/:verificationId/status',
    summary: 'Review an identity verification request',
    description:
      'Reviews a pending identity verification request by approving or rejecting it. Records the reviewing administrator, updates the review timestamp, and notifies the user of the decision.',
    tags: ['User Verifications', 'Admin'],
    security: ['CookieAuth'],
    request: {
      contentType: 'application/json',
      params: {
        verificationId: rules(['required', 'string']),
      },
      body: UpdateUserVerificationRule,
    },
    response: {
      200: {
        description:
          'Verification request reviewed successfully. Returns the updated verification record and sends a notification to the user.',
      },
      400: {
        description:
          'The request is not pending review, or a rejection reason is missing when rejecting the request.',
      },
      404: {
        description: 'No verification request was found for the provided ID.',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
