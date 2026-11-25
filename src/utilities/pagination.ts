import type { Context } from 'lykosjs'

export function getPagination(ctx: Context) {
  const page = Math.max(1, Number(ctx.query.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(ctx.query.get('limit')) || 10))

  return { page, limit, offset: (page - 1) * limit }
}

export function buildPagination(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPreviousPage: page > 1,
  }
}
