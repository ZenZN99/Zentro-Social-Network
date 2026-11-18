import { corsMiddleware, loggerMiddleware, RiserBob } from 'riser-bob'
import { Modules } from './modules'
import { FRONTEND_URL } from './url'
import { PresenceGateway } from './config/gateways/presence.gateway'
import { AuthSocketAdapter } from './config/adapters/socket.adapter'
import { connectDB } from './config/db/connect-db'
import openapi from './openapi/openapi'
import { migrateDB } from './config/db/migrations'

async function bootstrap() {
  const bob = new RiserBob()

  await connectDB()
  await migrateDB()

  bob.spongUse(
    corsMiddleware({
      origin: FRONTEND_URL,
      credentials: true,
    }),
  )
  bob.spongUse(loggerMiddleware)

  bob.spongGet('/', async (spongReq, spongRes) => {
    return spongRes.json({ message: 'Welcome to Bikini Bottom! 🍍' })
  })

  const io = bob.spongSocketIO({
    cors: {
      origin: FRONTEND_URL,
      credentials: true,
    },
  })

  const authSocketAdapter = new AuthSocketAdapter()

  authSocketAdapter.initialize(io)

  const presenceGateway = new PresenceGateway(io)

  io.on('connection', (socket) => {
    presenceGateway.handleConnection(socket)

    socket.on('disconnect', () => {
      presenceGateway.handleDisconnect(socket)
    })
  })

  Modules(bob, io)

  openapi.setup(bob)

  bob.spongListen(4000, () => {
    console.log('🧽 RiserBob is running at http://localhost:4000 🍍')
  })
}

bootstrap().catch((error: unknown) => {
  console.error('[RiserBob] Failed to start application:', error)
  process.exit(1)
})
