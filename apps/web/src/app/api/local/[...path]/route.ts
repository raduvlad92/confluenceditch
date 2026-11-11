import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { isConfluenceError } from "@confluenceditch/confluence"
import { connect, deleteSession, getSession, latestCapture, SESSION_COOKIE, startCapture } from "@/lib/local/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const id = z.string().regex(/^\d+$/).max(30)
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params
    if (process.env.CONFLUENCE_LOCAL_TEST !== "1" || !localHosts.has(new URL(request.url).hostname)) return json({ error: "The direct connector is available only on the local test server." }, 403)
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403)
    if (!["GET", "HEAD"].includes(request.method) && request.headers.get("x-confluenceditch-client") !== "local-ui") return json({ error: "Open this action from the local interface." }, 403)
    const sessionId = request.cookies.get(SESSION_COOKIE)?.value
    const session = getSession(sessionId)
    const route = path.join("/")
    if (route === "session" && request.method === "GET") return json({ enabled: true, connection: session?.connection ?? null, capture: session ? latestCapture(session) : null })
    if (route === "connect" && request.method === "POST") {
      if (Number(request.headers.get("content-length")) > 12_000) return json({ error: "Connection request is too large." }, 413)
      const raw = await request.text()
      if (raw.length > 12_000) return json({ error: "Connection request is too large." }, 413)
      const input = z.discriminatedUnion("mode", [
        z.object({ mode: z.literal("demo") }),
        z.object({ mode: z.literal("live"), siteUrl: z.string().max(300), email: z.email().max(300), token: z.string().min(1).max(4096) }),
      ]).parse(JSON.parse(raw))
      const connected = await connect(input)
      if (session) deleteSession(session.id)
      const response = json({ connection: connected.connection })
      response.cookies.set(SESSION_COOKIE, connected.id, { httpOnly: true, sameSite: "strict", secure: false, path: "/api/local", maxAge: 7200 })
      return response
    }
    if (!session) return json({ error: "Your local connection expired or the server restarted. Connect again to continue." }, 401)
    if (route === "session" && request.method === "DELETE") {
      deleteSession(session.id)
      const response = json({ disconnected: true })
      response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/api/local", maxAge: 0 })
      return response
    }
    if (route === "spaces" && request.method === "GET") {
      const cursor = z.string().max(4000).nullable().parse(request.nextUrl.searchParams.get("cursor"))
      const result = await session.client.spaces(cursor)
      for (const space of result.data) session.spaces.set(space.id, space)
      return json({ spaces: result.data, cursor: result.cursor })
    }
    if (route === "pages" && request.method === "GET") {
      const spaceId = id.parse(request.nextUrl.searchParams.get("spaceId"))
      if (!session.spaces.has(spaceId)) return json({ error: "Choose a space from this connection first." }, 400)
      const cursor = z.string().max(4000).nullable().parse(request.nextUrl.searchParams.get("cursor"))
      const result = await session.client.pages(spaceId, cursor)
      for (const page of result.data) if (page.spaceId === spaceId) session.pages.set(page.id, page)
      return json({ pages: result.data.filter(page => page.spaceId === spaceId), cursor: result.cursor })
    }
    if (route === "captures" && request.method === "POST") {
      const raw = await request.text()
      if (raw.length > 8000) return json({ error: "Selection is too large." }, 413)
      const input = z.object({ spaceId: id, pageIds: z.array(id).min(1).max(20).refine(values => new Set(values).size === values.length), includeAttachments: z.boolean() }).parse(JSON.parse(raw))
      const key = z.uuid().parse(request.headers.get("idempotency-key"))
      return json({ capture: startCapture(session, input, key) }, 202)
    }
    if (path[0] === "captures" && path[1]) {
      const record = session.captures.get(path[1])
      if (!record) return json({ error: "Takeout not found in this local session." }, 404)
      if (path.length === 2 && request.method === "GET") return json({ capture: record.public })
      if (path.length === 2 && request.method === "DELETE") {
        record.controller.abort(); record.public.status = "cancelled"; record.public.result = undefined; record.archive = undefined; record.zip = undefined
        return json({ capture: record.public })
      }
      if (request.method === "GET" && path.length === 3 && ["ready", "ready_with_gaps"].includes(record.public.status) && record.archive) {
        if (path[2] === "download" && record.zip) return new NextResponse(new Uint8Array(record.zip).buffer, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="confluence-takeout-${record.public.id.slice(0, 8)}.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
        const target = request.nextUrl.searchParams.get("path") ?? ""
        const entry = record.archive.manifest.files.find(file => file.path === target)
        const bytes = entry ? record.archive.files.get(target) : undefined
        if (!entry || !bytes) return json({ error: "File is not part of this takeout." }, 404)
        if (path[2] === "document" && entry.mediaType === "text/markdown") return json({ markdown: new TextDecoder().decode(bytes) })
        if (path[2] === "file") {
          const image = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(entry.mediaType)
          return new NextResponse(new Uint8Array(bytes).buffer, { headers: { "Content-Type": image ? entry.mediaType : "application/octet-stream", "Content-Disposition": `${image ? "inline" : "attachment"}; filename="${target.split("/").at(-1)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } })
        }
      }
    }
    return json({ error: "This local action is not available." }, 404)
  } catch (error) {
    if (isConfluenceError(error)) return json({ error: error.message, code: error.code }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "Check the fields or selection and try again." }, 400)
    return json({ error: "The local action failed. Try again or reconnect." }, 500)
  }
}
export { handle as GET, handle as POST, handle as DELETE }
