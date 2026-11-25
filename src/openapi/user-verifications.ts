import { Validator } from 'lykosjs'
import { UpdateUserVerificationRule } from '../modules/user-verifications/rules/update'
import type { OpenAPIRoute } from '@lykosjs/openapi'

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
        profileImage: Validator.text().required(),
        identityDocument: Validator.text().required(),
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
        page: Validator.text().optional(),
        limit:  Validator.text().optional(),
        offset:  Validator.text().optional(),
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
        verificationId:  Validator.text().required(),
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
