import type { SpongHandler } from 'riser-bob'
import type { AuthService, LoginBody, RegisterBody } from './auth.service'

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  readonly register: SpongHandler = async (spongReq, spongRes) => {
    const body = await spongReq.json<RegisterBody>()

    const result = await this.authService.register(body, spongReq)

    return result
  }

  readonly login: SpongHandler = async (spongReq, spongRes) => {
    const body = await spongReq.json<LoginBody>()

    const result = await this.authService.login(body, spongReq)

    return result
  }

  readonly logout: SpongHandler = async (spongReq, spongRes) => {
    const result = await this.authService.logout(spongReq)

    return result
  }

  readonly me: SpongHandler = async (spongReq, spongRes) => {
    const currentUser = spongReq.user!

    const result = await this.authService.me(currentUser)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly refreshToken: SpongHandler = async (spongReq, spongRes) => {
    const result = await this.authService.refreshToken(spongReq)

    return result
  }
}
