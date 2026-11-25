import { Server, Socket } from 'socket.io'

interface OnlineUser {
  userId: string
  socketId: string
}

interface MessageData {
  receiverId: string
  message: unknown
}

interface MessageDeletedData {
  receiverId: string
  messageId: string
}

let onlineUsers: OnlineUser[] = []

// Add user socket
const addUser = (userId: string, socketId: string): void => {
  const exists = onlineUsers.some((user) => user.userId === userId && user.socketId === socketId)

  if (!exists) {
    onlineUsers.push({ userId, socketId })
  }
}

// Remove socket
const removeUser = (socketId: string): void => {
  onlineUsers = onlineUsers.filter((user) => user.socketId !== socketId)
}

// Get all sockets for user
const getUsers = (userId: string): OnlineUser[] => {
  return onlineUsers.filter((user) => user.userId === userId)
}

export class MessagesGateway {
  private static server: Server | null = null

  // Called once from launch.ts (replaces the old constructor logic)
  static setServer(server: Server): void {
    MessagesGateway.server = server

    server.on('connection', (client: Socket) => {
      MessagesGateway.handleConnection(client) //Error: Property 'handleConnection' does not exist on type 'typeof MessagesGateway'.

      client.on('disconnect', () => {
        MessagesGateway.handleDisconnect(client)
      })
    })
  }

  // Connection
  private static handleConnection(client: Socket): void {
    const user = client.data.user

    if (!user) {
      client.disconnect(true)
      return
    }

    addUser(user.id, client.id)

    console.log('🟢 Message socket connected:', user.id)
    console.log('📊 Online users:', onlineUsers)
  }

  // Disconnect
  private static handleDisconnect(client: Socket): void {
    removeUser(client.id)

    console.log('🔴 Message socket disconnected:', client.id)
    console.log('📊 Online users:', onlineUsers)
  }

  // Send message
  sendMessage(data: MessageData): void {
    const server = MessagesGateway.server
    if (!server) {
      console.warn('⚠️ MessageGateway: server not set yet')
      return
    }

    const receivers = getUsers(data.receiverId)

    console.log('📤 Sending message to:', data.receiverId)
    console.log('📡 Active sockets:', receivers)

    if (!receivers.length) {
      console.log('⚠️ User is offline')
      return
    }

    receivers.forEach((user) => {
      server.to(user.socketId).emit('receive-message', data.message)
    })
  }

  // Message deleted
  sendMessageDeleted(data: MessageDeletedData): void {
    const server = MessagesGateway.server
    if (!server) return

    const receivers = getUsers(data.receiverId)

    console.log('🗑️ Sending message deletion to:', data.receiverId)

    receivers.forEach((user) => {
      server.to(user.socketId).emit('message-deleted', {
        messageId: data.messageId,
      })
    })
  }
}
