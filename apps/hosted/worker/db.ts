import { neon } from "@neondatabase/serverless"
import { ConfluenceClient, type Credentials } from "@confluenceditch/confluence"
import { demoFetch } from "@confluenceditch/confluence/demo"
import { decrypt, HttpError } from "./security"
import type { Env } from "./types"
import type { LocalCapture, LocalConnection, LocalPage, LocalSpace } from "../../web/src/lib/local/types"

export const database = (env: Env) => neon(env.DATABASE_URL)
export interface Connection { id: string; user_id: string; mode: "live" | "demo"; credentials: string; public: LocalConnection; account_id: string | null; expires_at: string }
export interface Selection { space: LocalSpace; pages: LocalPage[]; includeAttachments: boolean }
export interface Capture { id: string; user_id: string; connection_id: string; fingerprint: string; selection: Selection; status: LocalCapture["status"]; progress: Omit<LocalCapture,"id"|"status"|"createdAt"|"error">; generation: number; artifact_prefix: string | null; error: string | null; created_at: string; expires_at: string }
export async function connection(env: Env, userId: string): Promise<Connection | null> {
  const rows = await database(env)`SELECT id,user_id,mode,credentials,public,account_id,expires_at FROM cd_connections WHERE user_id=${userId} AND revoked_at IS NULL AND expires_at>now()`
  return rows[0] as Connection ?? null
}
export async function source(env: Env, record: Connection) {
  const credentials = await decrypt<Credentials>(record.credentials, env.CREDENTIAL_KEY, `${record.user_id}:${record.id}`)
  const client = new ConfluenceClient(credentials, record.mode === "demo" ? demoFetch : fetch)
  // Connections from the initial deployment did not retain scoped-token routing.
  if (record.mode === "live" && !credentials.cloudId) await client.authenticate()
  return client
}
export async function ownedCapture(env: Env, userId: string, id: string): Promise<Capture> {
  const rows = await database(env)`SELECT a.* FROM cd_captures a JOIN cd_connections c ON c.id=a.connection_id AND c.user_id=a.user_id WHERE a.id=${id} AND a.user_id=${userId} AND a.expires_at>now() AND c.revoked_at IS NULL AND c.expires_at>now()`
  if (!rows.length) throw new HttpError(404, "Takeout not found, disconnected, or expired.")
  return rows[0] as Capture
}
export async function publicCapture(env: Env, record: Capture): Promise<LocalCapture> {
  const value: LocalCapture = { ...record.progress, id: record.id, status: record.status, createdAt: new Date(record.created_at).toISOString(), error: record.error }
  if (["ready","ready_with_gaps"].includes(record.status) && record.artifact_prefix) {
    const object = await env.ARCHIVES.get(`${record.artifact_prefix}/reader.json`)
    if (!object) throw new HttpError(503, "The archive could not be read. Try again shortly.")
    value.result = await object.json<NonNullable<LocalCapture["result"]>>()
  }
  return value
}
export async function revoke(env: Env, userId: string) {
  const sql = database(env)
  await sql.transaction([
    sql`UPDATE cd_connections SET revoked_at=now(),credentials='' WHERE user_id=${userId} AND revoked_at IS NULL`,
    sql`UPDATE cd_captures SET status='cancelled',generation=generation+1 WHERE user_id=${userId} AND status IN ('queued','running','ready','ready_with_gaps')`,
  ])
}
export async function purge(env: Env) {
  const sql = database(env)
  await sql`UPDATE cd_connections SET revoked_at=coalesce(revoked_at,now()),credentials='' WHERE expires_at<=now() AND purged=false`
  const records = await sql`SELECT id FROM cd_connections WHERE revoked_at IS NOT NULL AND purged=false ORDER BY created_at LIMIT 20`
  for (const record of records) {
    const captures = await sql`SELECT id FROM cd_captures WHERE connection_id=${record.id}`
    for (const capture of captures) {
      let cursor: string | undefined
      do {
        const list = await env.ARCHIVES.list({ prefix: `captures/${capture.id}/`, cursor, limit: 1000 })
        if (list.objects.length) await env.ARCHIVES.delete(list.objects.map(object => object.key))
        cursor = list.truncated ? list.cursor : undefined
      } while (cursor)
    }
    await sql.transaction([
      sql`UPDATE cd_captures SET status='cancelled',generation=generation+1,selection='{}',artifact_prefix=NULL WHERE connection_id=${record.id}`,
      sql`UPDATE cd_connections SET purged=true,public='{}',account_id=NULL WHERE id=${record.id}`,
    ])
  }
}
