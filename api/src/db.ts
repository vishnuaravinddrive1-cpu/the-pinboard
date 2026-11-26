import type { Db, Stmt } from './types.ts'

const anonPrefix: Stmt[] = [{ text: "select set_config('app.uid', '', true)" }, { text: 'set local role anon' }]
const userPrefix = (uid: string): Stmt[] => [{ text: "select set_config('app.uid', $1, true)", params: [uid] }, { text: 'set local role authenticated' }]

async function run(db: Db, prefix: Stmt[], stmts: Stmt[]) {
  const out = await db.tx([...prefix, ...stmts])
  return out.slice(prefix.length)
}
/** As an anonymous visitor: Row Level Security applies. */
export const asAnon = (db: Db, ...stmts: Stmt[]) => run(db, anonPrefix, stmts)
/** As a signed-in user: Row Level Security applies with app.uid = user id. */
export const asUser = (db: Db, uid: string, ...stmts: Stmt[]) => run(db, userPrefix(uid), stmts)
/** As the database owner (sign-in, email queue, cron). Never used for request data from users without explicit checks. */
export const asOwner = (db: Db, ...stmts: Stmt[]) => db.tx(stmts)

export const q = (text: string, ...params: unknown[]): Stmt => ({ text, params })

/** Postgres errors we raised on purpose (P0001) are safe to show; others are mapped or hidden. */
export function describeDbError(e: any): { status: number; message: string } {
  const code = e?.code as string | undefined
  if (code === 'P0001') return { status: 400, message: String(e.message).replace(/^error: /i, '') }
  if (code === '23505') return { status: 409, message: 'That already exists.' }
  if (code === '23514' || code === '22P02' || code === '22007' || code === '22001' || code === '23502') return { status: 400, message: 'Please check the details you entered.' }
  if (code === '42501') return { status: 403, message: 'You are not allowed to do that.' }
  return { status: 500, message: 'Something went wrong. Please try again.' }
}
