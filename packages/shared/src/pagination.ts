// Every list endpoint is server-paginated with this shape (CLAUDE.md non-negotiable 8).
import { z } from 'zod'

export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25

// Query strings arrive as text, so page numbers are coerced.
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})
export type PageQuery = z.infer<typeof pageQuerySchema>

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  })
}
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }

export function pageOffset(query: PageQuery): number {
  return (query.page - 1) * query.pageSize
}

export function toPage<T>(items: T[], total: number, query: PageQuery): Page<T> {
  return { items, page: query.page, pageSize: query.pageSize, total }
}
