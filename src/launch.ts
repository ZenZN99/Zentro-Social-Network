import { corsMiddleware, loggerMiddleware, Lykos } from 'lykosjs'
import { FRONTEND_URL } from './url'
import { PresenceGateway } from './config/gateways/presence.gateway'
import { AuthSocketAdapter } from './config/adapters/socket.adapter'
import { connectDB } from './config/db/connect-db'
import openapi from './openapi/openapi'
import { migrateDB } from './config/db/migrations'
import { NotificationsGateway } from './config/gateways/notifications.gateway'
import { MessagesGateway } from './config/gateways/messages.gateway'
import { Modules } from './modules'

async function launch() {
  const app = new Lykos()

  await connectDB()
  await migrateDB()

  app.use(
    corsMiddleware({
      origin: FRONTEND_URL,
      credentials: true,
    }),
  )
  app.use(loggerMiddleware)

  const io = app.socketIO({
    cors: {
      origin: FRONTEND_URL,
      credentials: true,
    },
  })

  NotificationsGateway.setServer(io)
  MessagesGateway.setServer(io)

  app.modules(Modules)

  const authSocketAdapter = new AuthSocketAdapter()

  authSocketAdapter.initialize(io)

  const presenceGateway = new PresenceGateway(io)

  io.on('connection', (socket) => {
    presenceGateway.handleConnection(socket)

    socket.on('disconnect', () => {
      presenceGateway.handleDisconnect(socket)
    })
  })

  openapi.setup(app)

  app.GET('/', async (ctx, reply) => reply.send('Welcome to LykosJS 🐺'))

  app.listen(4000, () => console.log('🐺 LykosJS is running at http://localhost:4000'))
}

launch().catch((error: unknown) => {
  console.error('🐺 [LykosJS] Failed to start application:', error)
  process.exit(1)
})
