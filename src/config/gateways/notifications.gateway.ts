import type { Server, Socket } from 'socket.io'

interface OnlineUser {
  userId: string
  socketId: string
}

let onlineUsers: OnlineUser[] = []

// Add user (multi sockets support)
const addUser = (userId: string, socketId: string) => {
  const exists = onlineUsers.some((user) => user.userId === userId && user.socketId === socketId)

  if (!exists) {
    onlineUsers.push({
      userId,
      socketId,
    })
  }
}

// Remove socket
const removeUser = (socketId: string) => {
  onlineUsers = onlineUsers.filter((user) => user.socketId !== socketId)
}

// Get all sockets for user
const getUsers = (userId: string) => {
  return onlineUsers.filter((user) => user.userId === userId)
}

/**
 * This gateway is responsible ONLY for connection management and
 * pushing events to clients. It must NOT depend on NotificationService,
 * because NotificationService already depends on this gateway.
 *
 * Incoming socket events (e.g. mark-as-read) are handled in
 * NotificationSocketGateway.
 */
export class NotificationsGateway {
  private static server: Server | null = null

  static setServer(server: Server) {
    NotificationsGateway.server = server
  }
  // On connect
  handleConnection(client: Socket) {
    const user = client.data.user

    if (!user) {
      client.disconnect()
      return
    }

    addUser(user.id, client.id)

    console.log('🟢 User connected:', user.id)
    console.log('📊 Online users:', onlineUsers)
  }

  // On disconnect
  handleDisconnect(client: Socket) {
    removeUser(client.id)

    console.log('🔴 Socket disconnected:', client.id)
    console.log('📊 Online users:', onlineUsers)
  }

  // Send notification
  // NOTE: notification must be the FULL notification record.
  // It must contain `id` at the root and the populated `sender`.
  sendNotification(notification: { id: string; receiverId: string; [key: string]: any }) {
    const server = NotificationsGateway.server
    if (!server) {
      console.warn('⚠️ NotificationGateway: server not set yet')
      return
    }
    const receivers = getUsers(notification.receiverId)

    console.log('📤 Sending notification to:', notification.receiverId)
    console.log('📡 Active sockets:', receivers)

    if (!receivers.length) {
      console.log('⚠️ User not online')
      return
    }

    receivers.forEach((user) => {
      server.to(user.socketId).emit('receive-notification', notification)
    })
  }

  sendMarkAsRead(receiverId: string, notificationId: string) {
    const server = NotificationsGateway.server
    if (!server) return

    getUsers(receiverId).forEach((user) => {
      server.to(user.socketId).emit('notification-read', { notificationId })
    })
  }

  sendMarkAllAsRead(receiverId: string) {
    const server = NotificationsGateway.server
    if (!server) return

    getUsers(receiverId).forEach((user) => {
      server.to(user.socketId).emit('notifications-marked-as-read')
    })
  }
}
