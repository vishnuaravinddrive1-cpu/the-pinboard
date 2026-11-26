import { neon } from '@neondatabase/serverless'
import type { Db } from './types.ts'

/** Neon over HTTPS: one request per API call, run as a single non-interactive transaction. */
export function neonDb(url: string): Db {
  const sql = neon(url)
  return { tx: (stmts) => sql.transaction((t) => stmts.map((s) => t.query(s.text, s.params ?? []))) as Promise<Record<string, any>[][]> }
}
