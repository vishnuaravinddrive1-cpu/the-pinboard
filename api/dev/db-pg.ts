import pg from 'pg'
import type { Db } from '../src/types.ts'

/** Node/test implementation of Db on a normal Postgres connection (same single-transaction semantics as the Neon HTTP driver). */
export function pgDb(url: string): Db & { end(): Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 6 })
  return {
    async tx(stmts) {
      const c = await pool.connect()
      try {
        await c.query('begin')
        const out: Record<string, any>[][] = []
        for (const s of stmts) out.push((await c.query(s.text, (s.params ?? []) as any[])).rows)
        await c.query('commit')
        return out
      } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
    },
    end: () => pool.end(),
  }
}
