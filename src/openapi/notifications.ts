import type { OpenAPIRoute } from '@riser-bob/openapi'
import { rules } from 'riser-bob'

export const notificationsAPI = {
  findMe: {
    method: 'GET',
    path: '/api/notifications/me',
    summary: 'Get my notifications',
    description:
      'Retrieves all notifications received by the authenticated user, including sender information and the sender’s avatar when available. Notifications are ordered by creation date in descending order.',
    tags: ['Notifications'],
    security: ['CookieAuth'],
    response: {
      200: {
        description: 'Notifications retrieved successfully',
      },
    },
  },

  markAsRead: {
    method: 'PATCH',
    path: '/api/notifications/:notificationId/read',
    summary: 'Mark notification as read',
    description:
      'Marks a notification as read for the authenticated user. If the notification is already read, it returns its current data without updating it again. Sends a real-time read-status update through the notifications gateway.',
    tags: ['Notifications'],
    security: ['CookieAuth'],
    request: {
      params: {
        notificationId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Notification marked as read successfully',
      },
      404: {
        description: 'Notification not found',
      },
    },
  },

  markAllAsRead: {
    method: 'PUT',
    path: '/api/notifications/read-all',
    summary: 'Mark all notifications as read',
    description:
      'Marks all unread notifications belonging to the authenticated user as read. Updates their updatedAt timestamp and sends a real-time notification through the notifications gateway.',
    tags: ['Notifications'],
    security: ['CookieAuth'],
    response: {
      200: {
        description: 'All notifications marked as read successfully',
      },
    },
  },

  delete: {
    method: 'DELETE',
    path: '/api/notifications/:notificationId',
    summary: 'Delete notification',
    description:
      'Deletes a notification belonging to the authenticated user. The notification is identified by its ID and receiver ID.',
    tags: ['Notifications'],
    security: ['CookieAuth'],
    request: {
      params: {
        notificationId: rules(['required', 'string']),
      },
    },
    response: {
      200: {
        description: 'Notification deleted successfully',
      },
      404: {
        description: 'Notification not found',
      },
    },
  },
} satisfies Record<string, OpenAPIRoute>
