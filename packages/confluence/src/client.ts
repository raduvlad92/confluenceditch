import { z } from "zod"

export const LOCAL_LIMITS = { pages: 20, fileBytes: 1024 * 1024, assetBytes: 2 * 1024 * 1024, responseBytes: 2 * 1024 * 1024, totalSourceBytes: 2 * 1024 * 1024 }
const nativeId = z.string().regex(/^\d+$/).max(30)
const optionalString = z.string().nullable().optional()
const version = z.object({ number: z.number().int().positive(), createdAt: optionalString, authorId: optionalString })
export const spaceSchema = z.object({ id: nativeId, key: z.string().min(1).max(200), name: z.string().min(1).max(200), type: z.string().optional() })
export const pageSummarySchema = z.object({ id: nativeId, title: z.string().min(1).max(2000), spaceId: nativeId, status: z.string(), subtype: optionalString, version: version.optional() })
export const pageSchema = pageSummarySchema.extend({
  parentId: nativeId.nullable().optional(), parentType: optionalString,
  authorId: optionalString, ownerId: optionalString, version,
  body: z.object({ storage: z.object({ value: z.string() }) }),
  _links: z.object({ webui: z.string().optional() }).optional(),
})
export const attachmentSchema = z.object({
  id: z.string().min(1).max(100), pageId: nativeId.optional(), title: z.string().min(1).max(200), status: z.string(),
  mediaType: z.string().min(1).max(200), fileSize: z.number().int().nonnegative(), version,
  downloadLink: z.string().optional(), _links: z.object({ download: z.string().optional() }).optional(),
})
export type Space = z.infer<typeof spaceSchema>
export type PageSummary = z.infer<typeof pageSummarySchema>
export type Page = z.infer<typeof pageSchema>
export type Attachment = z.infer<typeof attachmentSchema>
export type SourceReply<T> = { data: T; bytes: Uint8Array; observedAt: string }
export type ListReply<T> = SourceReply<T[]> & { cursor: string | null }
export interface Credentials { siteUrl: string; email: string; token: string }

export class ConfluenceError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = "ConfluenceError" }
}

export function isConfluenceError(value: unknown): value is ConfluenceError {
  return value instanceof ConfluenceError || (typeof value === "object" && value !== null && "name" in value && value.name === "ConfluenceError" && "code" in value && typeof value.code === "string" && "message" in value && typeof value.message === "string" && "status" in value && typeof value.status === "number")
}

export function normalizeSiteUrl(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new ConfluenceError("INVALID_SITE", "Enter your site URL, for example https://your-team.atlassian.net.") }
  if (url.protocol !== "https:" || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.atlassian\.net$/i.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !["", "/", "/wiki", "/wiki/"].includes(url.pathname)) {
    throw new ConfluenceError("INVALID_SITE", "Use an HTTPS Confluence Cloud site at your-team.atlassian.net, without a page path.")
  }
  return url.origin
}

export async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel()
    throw new ConfluenceError("SIZE_LIMIT", "This item exceeds the local test size limit. Select fewer pages or turn off attachments.")
  }
  const reader = response.body?.getReader()
  if (!reader) throw new ConfluenceError("EMPTY_RESPONSE", "Confluence returned no response body.")
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) throw new ConfluenceError("SIZE_LIMIT", "This item exceeds the local test size limit. Select fewer pages or turn off attachments.")
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

function statusError(status: number): ConfluenceError {
  if (status === 401) return new ConfluenceError("AUTHENTICATION_FAILED", "Confluence rejected the email or token. Check the credentials and token expiry.", 401)
  if (status === 403) return new ConfluenceError("ACCESS_DENIED", "This account or token cannot read the requested Confluence content. Check its site access and read scopes.", 403)
  if (status === 404) return new ConfluenceError("UNAVAILABLE", "The requested Confluence item is unavailable or cannot be viewed by this account.", 404)
  if (status === 429) return new ConfluenceError("RATE_LIMITED", "Confluence is limiting requests. Wait before trying again; this attempt will not be reported as complete.", 429)
  return new ConfluenceError("SOURCE_ERROR", `Confluence returned an error (${status}). Try again after checking the source service.`, 502)
}

export class ConfluenceClient {
  readonly siteUrl: string
  private apiOrigin: string
  private apiPrefix = ""
  private authorization: string
  private accountLabel: string
  static rebind(client: ConfluenceClient): ConfluenceClient {
    // Local in-memory sessions survive Next's hot reload; use the current adapter behavior.
    return Object.assign(Object.create(ConfluenceClient.prototype), client) as ConfluenceClient
  }
  constructor(credentials: Credentials, private fetcher: typeof fetch = fetch, private signal?: AbortSignal) {
    // Workers native fetch requires the global receiver, including when injected.
    this.fetcher = fetcher.bind(globalThis)
    this.siteUrl = normalizeSiteUrl(credentials.siteUrl)
    if (!z.email().safeParse(credentials.email).success || !credentials.token || credentials.token.length > 4096 || /[\r\n]/.test(credentials.token)) throw new ConfluenceError("INVALID_CREDENTIALS", "Enter your Atlassian email and a valid API token.")
    this.authorization = `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${credentials.email}:${credentials.token}`)))}`
    this.accountLabel = credentials.email
    this.apiOrigin = this.siteUrl
  }
  withSignal(signal: AbortSignal): ConfluenceClient {
    const client = Object.assign(Object.create(ConfluenceClient.prototype), this) as ConfluenceClient
    client.signal = this.signal ? AbortSignal.any([this.signal, signal]) : signal
    return client
  }
  private async send(url: URL, authorization: boolean): Promise<Response> {
    try {
      return await this.fetcher(url, {
        method: "GET", redirect: "manual", cache: "no-store",
        headers: { Accept: "application/json", ...(authorization ? { Authorization: this.authorization } : {}) },
        signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
      })
    } catch {
      if (this.signal?.aborted) throw new ConfluenceError("CANCELLED", "The connection or takeout was cancelled.", 409)
      throw new ConfluenceError("NETWORK_ERROR", "Could not reach Confluence. Check your connection and try again.", 502)
    }
  }
  async json<T>(path: string, schema: z.ZodType<T>): Promise<SourceReply<T>> {
    if (!path.startsWith("/wiki/") || path.startsWith("//")) throw new ConfluenceError("INVALID_PATH", "Invalid source request.")
    const response = await this.send(new URL(`${this.apiPrefix}${path}`, this.apiOrigin), true)
    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        const detail = new TextDecoder().decode(await readBounded(response, 16_384))
        if (/scope/i.test(detail)) throw new ConfluenceError("SCOPE_MISMATCH", "The token's read scopes do not allow this Confluence endpoint.", response.status)
      } else await response.body?.cancel()
      throw statusError(response.status)
    }
    const bytes = await readBounded(response, LOCAL_LIMITS.responseBytes)
    try {
      const data = schema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)))
      return { data, bytes, observedAt: new Date().toISOString() }
    } catch { throw new ConfluenceError("INVALID_RESPONSE", "Confluence returned an unsupported response. Check the site URL and API access.", 502) }
  }
  async authenticate(): Promise<{ accountId: string | null; displayName: string }> {
    const schema = z.object({ accountId: z.string().min(1), displayName: z.string().optional(), publicName: z.string().optional() })
    let reply: SourceReply<z.infer<typeof schema>>
    try { reply = await this.json("/wiki/rest/api/user/current", schema) }
    catch (error) {
      if (!isConfluenceError(error) || !["AUTHENTICATION_FAILED", "ACCESS_DENIED", "SCOPE_MISMATCH"].includes(error.code)) throw error
      // Scoped API tokens use the gateway. Discover only this validated site's tenant ID.
      const response = await this.send(new URL("/_edge/tenant_info", this.siteUrl), false)
      if (!response.ok) { await response.body?.cancel(); throw error }
      try {
        const info = JSON.parse(new TextDecoder().decode(await readBounded(response, 16_384)))
        const cloudId = z.uuid().parse(info.cloudId)
        this.apiOrigin = "https://api.atlassian.com"
        this.apiPrefix = `/ex/confluence/${cloudId}`
      } catch { throw error }
      try { reply = await this.json("/wiki/rest/api/user/current", schema) }
      catch (profileError) {
        if (!isConfluenceError(profileError) || !["SCOPE_MISMATCH", "ACCESS_DENIED"].includes(profileError.code)) throw profileError
        // Scoped tokens can read v2 content without permission to the legacy current-user endpoint.
        // The gateway still validates the credentials. Do not invent a principal ID from the email.
        await this.spaces()
        return { accountId: null, displayName: this.accountLabel }
      }
    }
    return { accountId: reply.data.accountId, displayName: reply.data.displayName ?? reply.data.publicName ?? "Connected account" }
  }
  private async list<T>(path: string, schema: z.ZodType<T>, cursor: string | null): Promise<ListReply<T>> {
    const query = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) })
    const response = await this.json(`${path}?${query}`, z.object({ results: z.array(schema), _links: z.object({ next: z.string().optional() }).optional() }))
    const next = response.data._links?.next
    let nextCursor: string | null = null
    if (next) {
      const url = new URL(next, this.apiOrigin)
      if (url.origin !== this.apiOrigin || ![path, `${this.apiPrefix}${path}`].includes(url.pathname)) throw new ConfluenceError("INVALID_PAGINATION", "Confluence returned an unexpected pagination target.", 502)
      nextCursor = url.searchParams.get("cursor")
      if (!nextCursor || nextCursor === cursor) throw new ConfluenceError("INVALID_PAGINATION", "Confluence pagination did not advance.", 502)
    }
    return { ...response, data: response.data.results, cursor: nextCursor }
  }
  spaces(cursor: string | null = null) { return this.list("/wiki/api/v2/spaces", spaceSchema, cursor) }
  pages(spaceId: string, cursor: string | null = null) { nativeId.parse(spaceId); return this.list(`/wiki/api/v2/spaces/${spaceId}/pages`, pageSummarySchema, cursor) }
  page(id: string) { nativeId.parse(id); return this.json(`/wiki/api/v2/pages/${id}?body-format=storage&status=current`, pageSchema) }
  space(id: string) { nativeId.parse(id); return this.json(`/wiki/api/v2/spaces/${id}`, spaceSchema) }
  attachments(id: string, cursor: string | null = null) { nativeId.parse(id); return this.list(`/wiki/api/v2/pages/${id}/attachments`, attachmentSchema, cursor) }
  async download(attachment: Attachment): Promise<{ bytes: Uint8Array; observedAt: string; sourceUrl: string }> {
    if (attachment.fileSize > LOCAL_LIMITS.fileBytes) throw new ConfluenceError("SIZE_LIMIT", "Attachment exceeds the 1 MiB local test limit.")
    const link = attachment.downloadLink ?? attachment._links?.download
    if (!link) throw new ConfluenceError("MISSING_DOWNLOAD", "Confluence did not provide an attachment download link.")
    let url = new URL(/^\/(?:download\/attachments|rest\/api)\//.test(link) ? `/wiki${link}` : link, this.siteUrl)
    const nativeDownloadPath = attachment.pageId && /^(?:att)?\d+$/.test(attachment.id) ? `/wiki/rest/api/content/${attachment.pageId}/child/attachment/${attachment.id}/download` : null
    if (url.origin !== this.siteUrl || !(url.pathname.startsWith("/wiki/download/attachments/") || url.pathname === nativeDownloadPath) || url.username || url.password) throw new ConfluenceError("UNSAFE_DOWNLOAD", "The attachment download target is outside this site's supported download path.")
    url.searchParams.set("version", String(attachment.version.number))
    const sourceUrl = `${url.origin}${url.pathname}?version=${attachment.version.number}`
    if (this.apiOrigin !== this.siteUrl) {
      if (!nativeDownloadPath) throw new ConfluenceError("MISSING_DOWNLOAD", "The attachment lacks the native container identity required for scoped downloads.")
      url = new URL(`${this.apiPrefix}${nativeDownloadPath}?version=${attachment.version.number}`, this.apiOrigin)
    }
    for (let redirects = 0; redirects <= 3; redirects++) {
      const authenticated = url.origin === this.apiOrigin && (this.apiPrefix ? url.pathname === `${this.apiPrefix}${nativeDownloadPath}` : url.pathname.startsWith("/wiki/download/attachments/") || url.pathname === nativeDownloadPath)
      const response = await this.send(url, authenticated)
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location")
        await response.body?.cancel()
        if (!location || redirects === 3) throw new ConfluenceError("UNSAFE_DOWNLOAD", "Attachment redirects exceeded the supported limit.")
        const target = new URL(location, url)
        const supported = target.origin === this.siteUrl ? target.pathname.startsWith("/wiki/download/attachments/") : target.hostname === "api.media.atlassian.com"
        if (target.protocol !== "https:" || target.port || target.username || target.password || !supported) throw new ConfluenceError("UNSAFE_DOWNLOAD", "An attachment redirect is outside the supported Atlassian hosts.")
        url = target
        continue
      }
      if (!response.ok) { await response.body?.cancel(); throw statusError(response.status) }
      const bytes = await readBounded(response, LOCAL_LIMITS.fileBytes)
      if (bytes.byteLength !== attachment.fileSize) throw new ConfluenceError("INCOMPLETE_ASSET", "Attachment byte count differs from its source metadata.")
      return { bytes, sourceUrl, observedAt: new Date().toISOString() }
    }
    throw new ConfluenceError("MISSING_DOWNLOAD", "Attachment could not be downloaded.")
  }
}
