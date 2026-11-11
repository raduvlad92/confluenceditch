import { buildArchive, type ArchiveInput, type BuiltArchive } from "@confluenceditch/archive"
import { ConfluenceClient, ConfluenceError, isConfluenceError, LOCAL_LIMITS, type PageSummary, type SourceReply, type Space } from "./client"

const encoder = new TextEncoder()
async function digest(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), value => value.toString(16).padStart(2, "0")).join("") }
function base64(bytes: Uint8Array) {
  let value = ""
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(value)
}
export interface CaptureProgress { phase: "retrieving" | "converting" | "verifying"; pagesDone: number; pagesFailed: number; pagesTotal: number; assetsDone: number }

export async function capturePages(options: {
  client: ConfluenceClient; captureId: string; organizationId: string; accountId: string | null;
  mode?: "live" | "demo"; hosted?: boolean;
  space: Space; pages: PageSummary[]; includeAttachments: boolean;
  signal: AbortSignal; onProgress(progress: CaptureProgress): void;
}): Promise<BuiltArchive> {
  const { space, pages, signal } = options
  const client = options.client.withSignal(signal)
  if (!pages.length || pages.length > LOCAL_LIMITS.pages || new Set(pages.map(page => page.id)).size !== pages.length || pages.some(page => page.spaceId !== space.id || page.status !== "current" || page.subtype === "live")) throw new ConfluenceError("INVALID_SCOPE", "Select 1 to 20 published pages from one space.")
  const startedAt = new Date().toISOString()
  const namespaceId = new URL(client.siteUrl).hostname
  const principal = (id: string | null | undefined) => id ? `confluence:${namespaceId}:user:${id}` : null
  const input: ArchiveInput = {
    schemaVersion: "0.3.0", captureId: options.captureId, organizationId: options.organizationId, startedAt, completedAt: startedAt,
    source: { adapter: options.mode === "demo" ? "confluence-storage-fixture" : options.hosted ? "confluence-cloud-hosted" : "confluence-cloud-local", adapterVersion: "0.1.0", acquisitionPrincipalRef: principal(options.accountId), namespaces: [{ id: namespaceId, siteUrl: client.siteUrl }] },
    scope: { historyMode: "current_only", spaces: [{ namespaceId, id: space.id, key: space.key, name: space.name }] },
    inventory: { authority: "selected_scope", explanation: "Only the explicitly selected page IDs are requested. Observable space listings do not establish whole-space or site completeness.", documents: [] },
    capabilities: {
      history: { status: "excluded", reason: "Current content only was explicitly selected for this MVP.", observedAt: startedAt },
      assets: { status: options.includeAttachments ? "captured" : "excluded", reason: options.includeAttachments ? null : "Attachments were explicitly excluded.", observedAt: startedAt },
      identities: { status: "partial", reason: "Stable supplied author/owner IDs are retained; identity profiles are not collected.", observedAt: startedAt },
      memberships: { status: "unsupported", reason: "This connector does not capture group memberships.", observedAt: startedAt },
      permissions: { status: "unsupported", reason: "This connector does not capture source access rules. Readable does not mean public.", observedAt: startedAt },
    },
    documents: [], assets: [], evidence: [], sourcePayloads: [],
  }
  let sourceBytes = 0
  let assetBytes = 0
  let pagesDone = 0
  let pagesFailed = 0
  const progress = (phase: CaptureProgress["phase"] = "retrieving") => options.onProgress({ phase, pagesDone, pagesFailed, pagesTotal: pages.length, assetsDone: input.assets.length })
  const check = () => { if (signal.aborted) throw new ConfluenceError("CANCELLED", "The takeout was cancelled.", 409) }
  const preserve = async (id: string, reply: SourceReply<unknown>) => {
    sourceBytes += reply.bytes.byteLength
    if (sourceBytes > LOCAL_LIMITS.totalSourceBytes) throw new ConfluenceError("SIZE_LIMIT", "Selected source payloads exceed the 2 MiB local test limit. Choose fewer pages.")
    input.sourcePayloads.push({ namespaceId, id, observedAt: reply.observedAt, bytesBase64: base64(reply.bytes), sha256: await digest(reply.bytes) })
  }
  const assetGap = (reason: string, observedAt: string) => {
    input.capabilities.assets = { status: "partial", reason: `${input.capabilities.assets.reason ? `${input.capabilities.assets.reason} ` : ""}${reason}`.slice(0, 3900), observedAt }
  }
  progress()
  await preserve(`space:${space.id}`, await client.space(space.id))
  for (const selected of pages) {
    check()
    const identity = { namespaceId, objectType: "page" as const, id: selected.id }
    let reply: Awaited<ReturnType<ConfluenceClient["page"]>>
    try {
      reply = await client.page(selected.id)
      if (reply.data.id !== selected.id || reply.data.spaceId !== space.id || reply.data.status !== "current" || reply.data.subtype === "live") throw new ConfluenceError("SCOPE_CHANGED", "The page moved or is no longer a supported published page.")
      await preserve(`page:${selected.id}`, reply)
    } catch (error) {
      check()
      if (!isConfluenceError(error) || ["SIZE_LIMIT", "AUTHENTICATION_FAILED", "SCOPE_MISMATCH", "RATE_LIMITED", "NETWORK_ERROR"].includes(error.code)) throw error
      input.inventory.documents.push({ ...identity, spaceId: space.id, status: error.code === "ACCESS_DENIED" ? "inaccessible" : "unavailable", reason: error.message, observedAt: new Date().toISOString() })
      pagesFailed++; progress(); continue
    }
    const page = reply.data
    const drift = selected.version && selected.version.number !== page.version.number
    input.inventory.documents.push({ ...identity, spaceId: space.id, status: drift ? "partial" : "captured", reason: drift ? `Source changed after selection; actual revision ${page.version.number} was captured.` : null, observedAt: reply.observedAt })
    const bindings: ArchiveInput["documents"][number]["revisions"][number]["assetBindings"] = []
    if (options.includeAttachments) {
      let cursor: string | null = null
      const seen = new Set<string>()
      const seenCursors = new Set<string>()
      let batch = 0
      try {
        do {
          check()
          const attachments = await client.attachments(page.id, cursor)
          await preserve(`attachments:${page.id}:${batch++}`, attachments)
          for (const attachment of attachments.data) {
            check()
            if (seen.has(attachment.id)) continue
            seen.add(attachment.id)
            if (attachment.status !== "current") continue
            try {
              if (attachment.pageId && attachment.pageId !== page.id) throw new ConfluenceError("SCOPE_CHANGED", "An attachment container did not match the selected page.")
              if (assetBytes + attachment.fileSize > LOCAL_LIMITS.assetBytes) throw new ConfluenceError("SIZE_LIMIT", "Combined attachments exceed the 2 MiB local test limit.")
              const downloaded = await client.download(attachment)
              assetBytes += downloaded.bytes.byteLength
              input.assets.push({ namespaceId, id: attachment.id, revisionId: String(attachment.version.number), document: identity, filename: attachment.title, mediaType: attachment.mediaType, sourceUrl: downloaded.sourceUrl, observedAt: downloaded.observedAt, bytesBase64: base64(downloaded.bytes), sha256: await digest(downloaded.bytes) })
              bindings.push({ filename: attachment.title, assetId: attachment.id, revisionId: String(attachment.version.number) })
            } catch (error) {
              check()
              if (!isConfluenceError(error) || ["AUTHENTICATION_FAILED", "RATE_LIMITED", "NETWORK_ERROR"].includes(error.code)) throw error
              assetGap(`Attachment ${attachment.id}: ${error.message}`, new Date().toISOString())
            }
          }
          cursor = attachments.cursor
          if (cursor && (seenCursors.has(cursor) || batch > 20)) throw new ConfluenceError("INVALID_PAGINATION", "Attachment inventory could not be exhausted safely.")
          if (cursor) seenCursors.add(cursor)
        } while (cursor)
      } catch (error) {
        check()
        if (!isConfluenceError(error) || ["SIZE_LIMIT", "AUTHENTICATION_FAILED", "RATE_LIMITED", "NETWORK_ERROR"].includes(error.code)) throw error
        assetGap(`Page ${page.id}: attachment inventory is incomplete. ${error.message}`, new Date().toISOString())
      }
    }
    const duplicateNames = new Set(bindings.filter((binding, index) => bindings.findIndex(other => other.filename === binding.filename) !== index).map(binding => binding.filename))
    if (duplicateNames.size) assetGap(`Page ${page.id}: attachment names are ambiguous; those inline bindings remain unresolved.`, new Date().toISOString())
    input.documents.push({
      ...identity, spaceId: space.id, title: page.title, sourceUrl: `${client.siteUrl}/wiki/spaces/${encodeURIComponent(space.key)}/pages/${page.id}`,
      parent: page.parentId && page.parentType === "page" ? { namespaceId, objectType: "page", id: page.parentId } : null,
      parentState: page.parentId ? page.parentType === "page" ? "known" : "unknown" : "none",
      creatorRef: principal(page.authorId), ownerRef: principal(page.ownerId), lastEditorRef: principal(page.version.authorId), labels: null, currentRevisionId: String(page.version.number),
      revisions: [{ id: String(page.version.number), title: page.title, authorRef: principal(page.version.authorId), modifiedAt: page.version.createdAt ?? null, status: "captured", observedAt: reply.observedAt, reason: null, storage: page.body.storage.value, assetBindings: bindings.filter(binding => !duplicateNames.has(binding.filename)) }],
    })
    pagesDone++; progress()
  }
  check()
  if (!input.documents.length) throw new ConfluenceError("NO_CONTENT", "None of the selected pages could be captured. Review source access and try a different page.")
  input.completedAt = new Date().toISOString()
  progress("converting")
  let archive: BuiltArchive
  try { archive = await buildArchive(input) }
  catch { throw new ConfluenceError("ARCHIVE_FAILED", "Archive generation failed validation or exceeded local limits. Choose fewer pages or turn off attachments.", 422) }
  check()
  progress("verifying")
  return archive
}
