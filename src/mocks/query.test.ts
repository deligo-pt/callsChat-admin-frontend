import { describe, expect, it } from 'vitest'

import { queryCollection } from './query'

interface Row {
  id: string
  name: string
  status: string
  score: number
}

const ROWS: Row[] = Array.from({ length: 120 }, (_, index) => ({
  id: `row_${index}`,
  name: index % 2 === 0 ? `Alpha ${index}` : `Beta ${index}`,
  status: index % 3 === 0 ? 'ACTIVE' : 'SUSPENDED',
  score: index,
}))

function query(search: string) {
  return queryCollection(new URL(`https://x.test/list?${search}`), ROWS, {
    searchFields: ['id', 'name'],
    sortFields: ['name', 'score'],
    filters: { status: (row, value) => row.status === value },
  })
}

/**
 * plan.md §2.7: the mock must do REAL server-side pagination. If it returned
 * everything and let the browser slice it, every list page would be built
 * against behaviour the backend does not have.
 */
describe('mock query engine', () => {
  it('paginates with the verified pagination envelope', () => {
    const result = query('page=1&limit=25')
    expect(result.data).toHaveLength(25)
    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 120, totalPages: 5 })
  })

  it('returns the correct slice for a later page', () => {
    const result = query('page=3&limit=25')
    expect(result.data[0]?.id).toBe('row_50')
    expect(result.data).toHaveLength(25)
  })

  it('clamps a page beyond the end rather than returning nothing', () => {
    const result = query('page=99&limit=25')
    expect(result.pagination.page).toBe(5)
    expect(result.data).toHaveLength(20)
  })

  it('caps page size so a client cannot request an unbounded list', () => {
    const result = query('limit=100000')
    expect(result.pagination.limit).toBe(100)
  })

  it('filters before paginating', () => {
    const result = query('status=ACTIVE&limit=100')
    expect(result.pagination.total).toBe(40)
    expect(result.data.every((row) => row.status === 'ACTIVE')).toBe(true)
  })

  it('searches case-insensitively across the configured fields', () => {
    const result = query('search=alpha&limit=100')
    expect(result.pagination.total).toBe(60)
    expect(result.data.every((row) => row.name.startsWith('Alpha'))).toBe(true)
  })

  it('sorts ascending and descending', () => {
    expect(query('sortBy=score&sortOrder=asc').data[0]?.score).toBe(0)
    expect(query('sortBy=score&sortOrder=desc').data[0]?.score).toBe(119)
  })

  it('ignores a sort field outside the allowlist, as the API does', () => {
    const result = query('sortBy=status&sortOrder=desc')
    // Unchanged order — the field is not sortable.
    expect(result.data[0]?.id).toBe('row_0')
  })

  it('combines filter, search, sort and pagination', () => {
    const result = query(
      'status=ACTIVE&search=alpha&sortBy=score&sortOrder=desc&limit=10',
    )
    expect(result.data).toHaveLength(10)
    expect(result.data.every((row) => row.status === 'ACTIVE')).toBe(true)
    expect(result.data.every((row) => row.name.startsWith('Alpha'))).toBe(true)
    expect(result.data[0]!.score).toBeGreaterThan(result.data[9]!.score)
  })
})
