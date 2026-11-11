import { randomBytes, randomUUID } from "node:crypto"
import { capturePages, ConfluenceClient, ConfluenceError, isConfluenceError, type PageSummary, type Space } from "@confluenceditch/confluence"
import { createArchiveZip, type BuiltArchive } from "@confluenceditch/archive"
import { demoFetch } from "@confluenceditch/confluence/demo"
import type { LocalCapture, LocalConnection } from "./types"

export const SESSION_COOKIE = "cd_local_session"
export interface CaptureRecord { public: LocalCapture; controller: AbortController; archive?: BuiltArchive; zip?: Uint8Array; fingerprint: string }
export interface LocalRecord {
  id: string; expiresAt: number; connection: LocalConnection; client: ConfluenceClient; accountId: string | null;
  controller: AbortController; spaces: Map<string, Space>; pages: Map<string, PageSummary>;
  captures: Map<string, CaptureRecord>; commands: Map<string, string>;
  expiryTimer?: ReturnType<typeof setTimeout>;
}
const scope = globalThis as typeof globalThis & { __confluenceDitchLocalV1?: Map<string, LocalRecord> }
const sessions = scope.__confluenceDitchLocalV1 ??= new Map<string, LocalRecord>()

export function deleteSession(id: string) {
  const session = sessions.get(id)
  if (!session) return
  if (session.expiryTimer) clearTimeout(session.expiryTimer)
  session.controller.abort()
  for (const capture of session.captures.values()) capture.controller.abort()
  sessions.delete(id)
}
export function getSession(id: string | undefined): LocalRecord | null {
  for (const [key, session] of sessions) if (session.expiresAt <= Date.now()) deleteSession(key)
  return id ? sessions.get(id) ?? null : null
}
export async function connect(input: { mode: "live" | "demo"; siteUrl?: string; email?: string; token?: string }): Promise<LocalRecord> {
  getSession(undefined)
  if (sessions.size >= 8) throw new ConfluenceError("SESSION_LIMIT", "There are too many local connections. Disconnect an existing session or restart the local server.", 429)
  const controller = new AbortController()
  const client = new ConfluenceClient(input.mode === "demo" ? { siteUrl: "https://sample.atlassian.net", email: "sample@example.invalid", token: "synthetic-not-a-token" } : { siteUrl: input.siteUrl!, email: input.email!, token: input.token! }, input.mode === "demo" ? demoFetch : fetch, controller.signal)
  const account = await client.authenticate()
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000
  const session: LocalRecord = {
    id: randomBytes(32).toString("base64url"), expiresAt, client, controller, accountId: account.accountId,
    connection: { mode: input.mode, siteUrl: client.siteUrl, displayName: account.displayName, expiresAt: new Date(expiresAt).toISOString() },
    spaces: new Map(), pages: new Map(), captures: new Map(), commands: new Map(),
  }
  sessions.set(session.id, session)
  session.expiryTimer = setTimeout(() => deleteSession(session.id), expiresAt - Date.now())
  session.expiryTimer.unref()
  return session
}
export function latestCapture(session: LocalRecord): LocalCapture | null { return [...session.captures.values()].at(-1)?.public ?? null }

export function startCapture(session: LocalRecord, input: { spaceId: string; pageIds: string[]; includeAttachments: boolean }, key: string): LocalCapture {
  const fingerprint = JSON.stringify({ ...input, pageIds: [...input.pageIds].sort() })
  const existingId = session.commands.get(key)
  if (existingId) {
    const existing = session.captures.get(existingId)!
    if (existing.fingerprint !== fingerprint) throw new ConfluenceError("IDEMPOTENCY_CONFLICT", "This command was already used for a different selection.", 409)
    return existing.public
  }
  if ([...session.captures.values()].some(capture => ["queued", "running"].includes(capture.public.status))) throw new ConfluenceError("CAPTURE_ACTIVE", "A takeout is already running. Wait for it or cancel it first.", 409)
  if (session.captures.size >= 3) throw new ConfluenceError("CAPTURE_LIMIT", "This local session retains up to three takeouts. Disconnect and reconnect to clear them.", 409)
  const space = session.spaces.get(input.spaceId)
  const pages = input.pageIds.map(id => session.pages.get(id))
  if (!space || pages.some(page => !page || page.spaceId !== space.id)) throw new ConfluenceError("INVALID_SCOPE", "Reload the page list and select pages from the chosen space.")
  const id = randomUUID()
  const record: CaptureRecord = {
    fingerprint, controller: new AbortController(),
    public: { id, status: "queued", phase: "retrieving", pagesDone: 0, pagesFailed: 0, pagesTotal: pages.length, assetsDone: 0, createdAt: new Date().toISOString(), error: null },
  }
  session.captures.set(id, record); session.commands.set(key, id)
  void runCapture(session, record, space, pages as PageSummary[], input.includeAttachments)
  return record.public
}
async function runCapture(session: LocalRecord, record: CaptureRecord, space: Space, pages: PageSummary[], includeAttachments: boolean) {
  const signal = AbortSignal.any([session.controller.signal, record.controller.signal, AbortSignal.timeout(5 * 60 * 1000)])
  const current = () => !signal.aborted && getSession(session.id) === session
  record.public.status = "running"
  try {
    const archive = await capturePages({ client: ConfluenceClient.rebind(session.client), captureId: record.public.id, organizationId: "local-device-session", accountId: session.accountId, mode: session.connection.mode, space, pages, includeAttachments, signal, onProgress: progress => { if (current()) Object.assign(record.public, progress) } })
    const zip = await createArchiveZip(archive)
    if (!current()) return
    const documents = [...archive.files].filter(([path]) => /\/metadata\/pages\/[^/]+\.json$/.test(path)).map(([, bytes]) => {
      const metadata = JSON.parse(new TextDecoder().decode(bytes))
      return { path: metadata.currentPath as string, title: metadata.title as string, sourceKey: metadata.sourceKey as string, revision: metadata.currentRevisionId as string, authorRef: metadata.lastEditorRef as string | null, sourceUrl: metadata.sourceUrl as string, findings: archive.findings.filter(finding => finding.sourceKey === metadata.sourceKey).length }
    }).filter(document => document.path)
    record.archive = archive; record.zip = zip
    record.public.result = { documents, files: archive.manifest.files, findings: archive.findings, anchors: archive.manifest.anchors, sourceMode: archive.manifest.sourceMode, capabilities: archive.manifest.capabilities }
    record.public.status = archive.manifest.result
  } catch (error) {
    if (!current()) {
      if (getSession(session.id) === session && !record.controller.signal.aborted) { record.public.status = "failed"; record.public.error = "The local run timed out or was interrupted. Try fewer pages." }
      return
    }
    record.public.status = "failed"
    record.public.error = isConfluenceError(error) ? error.message : "The local takeout failed. Try fewer pages or check the connection."
  }
}
