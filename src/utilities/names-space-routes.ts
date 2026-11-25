import type { OpenAPIRoute } from '@lykosjs/openapi'

export function namespaceRoutes(prefix: string, routes: Record<string, OpenAPIRoute>) {
  return Object.fromEntries(
    Object.entries(routes).map(([key, route]) => [
      `${prefix}${key[0]!.toUpperCase()}${key.slice(1)}`,
      route,
    ]),
  )
}
