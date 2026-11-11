import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { capturePages, isConfluenceError, type Space, type PageSummary } from "@confluenceditch/confluence"
import { createArchiveZip } from "@confluenceditch/archive"
import { connection, database, ownedCapture, source } from "./db"
import type { Env } from "./types"
import type { LocalCapture } from "../../web/src/lib/local/types"

export class CaptureWorkflow extends WorkflowEntrypoint<Env, { captureId: string }> {
  async run(event: WorkflowEvent<{ captureId: string }>, step: WorkflowStep) {
    const id = event.payload.captureId
    const sql = database(this.env)
    try {
      return await step.do("capture-verify-and-store", { retries: { limit: 2, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" }, async () => {
        const rows = await sql`UPDATE cd_captures a SET status='running',generation=generation+1,error=NULL FROM cd_connections c WHERE a.id=${id} AND a.connection_id=c.id AND a.user_id=c.user_id AND a.status IN ('queued','running') AND a.expires_at>now() AND c.revoked_at IS NULL AND c.expires_at>now() RETURNING a.user_id,a.generation`
        if (!rows.length) return { captureId: id, skipped: true }
        const userId = rows[0].user_id as string
        const generation = rows[0].generation as number
        const record = await ownedCapture(this.env, userId, id)
        const connected = await connection(this.env, userId)
        if (!connected || connected.id !== record.connection_id) return { captureId: id, skipped: true }
        const controller = new AbortController()
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(250_000)])
        let progressTail = Promise.resolve(); let lastUpdate = 0
        const archive = await capturePages({
          client: await source(this.env, connected), captureId: id, organizationId: userId, accountId: connected.account_id,
          mode: connected.mode, hosted: true, space: record.selection.space as Space, pages: record.selection.pages as PageSummary[],
          includeAttachments: record.selection.includeAttachments, signal,
          onProgress: progress => {
            if (Date.now()-lastUpdate<1500 && progress.phase === "retrieving") return
            lastUpdate=Date.now()
            progressTail=progressTail.then(async () => {
              const updated = await sql`UPDATE cd_captures SET progress=${JSON.stringify(progress)}::jsonb WHERE id=${id} AND generation=${generation} AND status='running' RETURNING id`
              if (!updated.length) controller.abort()
            }).catch(() => { controller.abort() })
          },
        })
        await progressTail
        signal.throwIfAborted()
        const zip = await createArchiveZip(archive)
        const documents = [...archive.files].filter(([path]) => /\/metadata\/pages\/[^/]+\.json$/.test(path)).map(([, bytes]) => {
          const metadata = JSON.parse(new TextDecoder().decode(bytes))
          return { path: metadata.currentPath as string, title: metadata.title as string, sourceKey: metadata.sourceKey as string, revision: metadata.currentRevisionId as string, authorRef: metadata.lastEditorRef as string | null, sourceUrl: metadata.sourceUrl as string, findings: archive.findings.filter(finding => finding.sourceKey === metadata.sourceKey).length }
        }).filter(document => document.path)
        const result: NonNullable<LocalCapture["result"]> = { documents, files: archive.manifest.files, findings: archive.findings, anchors: archive.manifest.anchors, sourceMode: archive.manifest.sourceMode, capabilities: archive.manifest.capabilities }
        const prefix = `captures/${id}/${crypto.randomUUID()}`
        // A retry uses a fresh prefix. Generation fencing prevents stale publication.
        for (const [path, bytes] of archive.files) { signal.throwIfAborted(); await this.env.ARCHIVES.put(`${prefix}/files/${path}`, bytes) }
        await this.env.ARCHIVES.put(`${prefix}/archive.zip`, zip, { httpMetadata: { contentType: "application/zip" } })
        await this.env.ARCHIVES.put(`${prefix}/reader.json`, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } })
        const final = { phase: "verifying", pagesTotal: record.selection.pages.length, pagesDone: documents.length, pagesFailed: record.selection.pages.length-documents.length, assetsDone: archive.manifest.files.filter(file => file.path.includes("/assets/") && !file.path.includes("/metadata/")).length }
        const published = await sql`UPDATE cd_captures a SET status=${archive.manifest.result},artifact_prefix=${prefix},progress=${JSON.stringify(final)}::jsonb FROM cd_connections c WHERE a.id=${id} AND a.generation=${generation} AND a.status='running' AND a.connection_id=c.id AND c.revoked_at IS NULL AND c.expires_at>now() AND a.expires_at>now() RETURNING a.id`
        return { captureId: id, published: Boolean(published.length) }
      })
    } catch (error) {
      const message = isConfluenceError(error) ? error.message : "The export was interrupted or exceeded its limits. Reconnect and try fewer pages."
      await step.do("record-failure", async () => { await sql`UPDATE cd_captures SET status='failed',error=${message} WHERE id=${id} AND status IN ('queued','running')`; return { captureId: id } })
      return { captureId: id, failed: true }
    }
  }
}
