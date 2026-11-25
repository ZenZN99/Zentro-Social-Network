import { JwtManager } from '@lykosjs/jwt'

const jwt = new JwtManager({
  accessToken: {
    secret: process.env.JWT_ACCESS_SECRET!,
  },
  refreshToken: {
    secret: process.env.JWT_REFRESH_SECRET!,
  },
  algorithm: 'HS256',
  issuer: process.env.JWT_ISSUER!,
  audience: process.env.JWT_AUDIENCE!,
})

export default jwt
