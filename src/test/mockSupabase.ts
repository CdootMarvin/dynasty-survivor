import { vi } from 'vitest'

// Minimal stand-in for the subset of PostgrestFilterBuilder the app actually uses.
// Every chain method returns the same object, and the object is thenable so
// `await supabase.from(...).select(...).eq(...)` resolves regardless of how many
// (or few) methods were chained before the await.

export interface QueryResult<T = unknown> {
  data: T
  error: { message: string } | null
}

export interface QueryChain {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  then: (resolve: (r: QueryResult) => unknown, reject?: (e: unknown) => unknown) => unknown
}

export function makeChain(result: QueryResult): QueryChain {
  const chain = {} as QueryChain
  for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete', 'single'] as const) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return chain
}

/**
 * Scripts a series of `supabase.from(...)` calls in the exact order the component under test
 * makes them. Returns `{ impl, chains }`: pass `impl` to `mockImplementation`, then inspect
 * `chains[n]` (e.g. `chains[0].insert.mock.calls[0][0]`) to assert what a given call was made with.
 */
export function queueFrom(results: QueryResult[]) {
  const queue = [...results]
  const chains: QueryChain[] = []
  const impl = (table: string) => {
    const next = queue.shift()
    if (!next) throw new Error(`mockSupabase: no more queued results (extra call for table "${table}")`)
    const chain = makeChain(next)
    chains.push(chain)
    return chain
  }
  return { impl, chains }
}

export function ok<T>(data: T): QueryResult<T> {
  return { data, error: null }
}

export function fail(message: string): QueryResult<null> {
  return { data: null, error: { message } }
}
