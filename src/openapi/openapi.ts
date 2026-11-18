import { OpenAPI } from '@riser-bob/openapi'
import { authAPI } from './auth'
import { usersAPI } from './users'
import { userVerficationsAPI } from './user-verifications'
import { userProfilesAPI } from './user-profiles'
import { supportMessagesAPI } from './support-messages'
import { supportConversationsAPI } from './support-conversations'
import { repliesAPI } from './replies'
import { postsAPI } from './posts'
import { repostsAPI } from './reposts'
import { hashtagsAPI } from './hashtags'
import { notificationsAPI } from './notifications'
import { messagesAPI } from './messages'
import { likesAPI } from './likes'
import { followsAPI } from './follows'
import { conversationsAPI } from './conversations'
import { bookmarksAPI } from './bookmarks'
import { namespaceRoutes } from '../utilities/names-space-routes'

const openapi = new OpenAPI({
  info: {
    title: 'Zentro Social Network',
    version: '1.0.0',
    description:
      'A social networking platform API that enables users to connect, share posts, interact with content, and communicate in real time. Provides endpoints for authentication, user profiles, posts, comments, likes, follows, and notifications.',
  },
  docs: '/docs',
  json: '/docs/json',
  securitySchemes: {
    CookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'accessToken',
    },
  },
  routes: {
    ...namespaceRoutes('auth', authAPI),
    ...namespaceRoutes('users', usersAPI),
    ...namespaceRoutes('userVerifications', userVerficationsAPI),
    ...namespaceRoutes('userProfiles', userProfilesAPI),
    ...namespaceRoutes('supportMessages', supportMessagesAPI),
    ...namespaceRoutes('supportConversations', supportConversationsAPI),
    ...namespaceRoutes('replies', repliesAPI),
    ...namespaceRoutes('posts', postsAPI),
    ...namespaceRoutes('reposts', repostsAPI),
    ...namespaceRoutes('hashtags', hashtagsAPI),
    ...namespaceRoutes('notifications', notificationsAPI),
    ...namespaceRoutes('messages', messagesAPI),
    ...namespaceRoutes('likes', likesAPI),
    ...namespaceRoutes('follows', followsAPI),
    ...namespaceRoutes('conversations', conversationsAPI),
    ...namespaceRoutes('bookmarks', bookmarksAPI),
  },
})

export default openapi
