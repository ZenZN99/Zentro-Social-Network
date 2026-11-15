import { SpongUnauthorizedException, type SpongHandler } from 'riser-bob'
import type { SupportConversationsService } from './support-conversations.service'
import { getPagination } from '../../utilities/pagination'

export class SupportConversationsController {
  constructor(private readonly supportConversationsService: SupportConversationsService) {}

  readonly create: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const result = await this.supportConversationsService.create(userId)

    return spongRes.SpongCreated({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }

  readonly findAll: SpongHandler = async (spongReq, spongRes) => {
    const { page, limit, offset } = getPagination(spongReq)

    const result = await this.supportConversationsService.findAll(page, limit, offset)

    return spongRes.SpongOK({
      success: result.success,
      data: {
        conversations: result.data,
        pagination: result.pagination,
      },
    })
  }

  readonly findMe: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id

    const result = await this.supportConversationsService.findMe(userId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly findOne: SpongHandler = async (spongReq, spongRes) => {
    const userId = spongReq.user!.id
    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Support Conversation ID is required',
      })
    }

    const result = await this.supportConversationsService.findOne(userId, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      data: result.data,
    })
  }

  readonly toggle: SpongHandler = async (spongReq, spongRes) => {
    if (!spongReq.user) {
      throw new SpongUnauthorizedException({
        success: false,
        message: 'You are not authenticated',
      })
    }

    const adminId = spongReq.user.id
    const { conversationId } = spongReq.params

    if (!conversationId) {
      return spongRes.SpongBadRequest({
        success: false,
        message: 'Support Conversation ID is required',
      })
    }

    const result = await this.supportConversationsService.toggle(adminId, conversationId)

    return spongRes.SpongOK({
      success: result.success,
      message: result.message,
      data: result.data,
    })
  }
}
