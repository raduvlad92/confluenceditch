import assert from "node:assert/strict"
import test from "node:test"
import { capturePages, ConfluenceClient, normalizeSiteUrl } from "../src/index"
import { createArchiveZip, verifyArchive } from "@confluenceditch/archive"
import { demoFetch } from "../src/demo"

const credentials = { siteUrl: "https://sample.atlassian.net", email: "test@example.invalid", token: "test-token-not-a-real-secret" }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })
const run = async (fetcher: typeof fetch = demoFetch) => {
  const client = new ConfluenceClient(credentials, fetcher)
  const account = await client.authenticate()
  const space = (await client.spaces()).data[0]
  const pages = (await client.pages(space.id)).data
  return capturePages({ client, accountId: account.accountId, space, pages, mode: "demo", captureId: "test-capture", organizationId: "test-organization", includeAttachments: true, signal: new AbortController().signal, onProgress() {} })
}

test("selected current pages, raw payloads and real attachment bytes produce a verified ZIP", async () => {
  const methods: string[] = []
  const archive = await run(async (input, init) => { methods.push(init?.method ?? "GET"); return demoFetch(input, init) })
  assert.equal(archive.manifest.counts.capturedDocuments, 3)
  assert.equal(archive.manifest.counts.assets, 1)
  assert.equal(archive.manifest.sourceMode, "synthetic_fixture")
  assert.ok(archive.manifest.files.some(file => file.path.includes("originals/payloads")))
  assert.equal((await verifyArchive(archive.files)).ok, true)
  assert.ok((await createArchiveZip(archive)).byteLength > 1000)
  assert.ok(methods.every(method => method === "GET"))
})

test("untrusted site URLs cannot send credentials to arbitrary hosts", () => {
  for (const site of ["http://sample.atlassian.net", "https://sample.atlassian.net.attacker.invalid", "https://127.0.0.1", "https://user:password@sample.atlassian.net", "https://sample.atlassian.net:444", "https://sample.atlassian.net/wiki/pages/1", "https://sample.atlassian.net?token=secret"]) assert.throws(() => normalizeSiteUrl(site))
  assert.equal(normalizeSiteUrl("https://sample.atlassian.net/wiki/"), credentials.siteUrl)
})

test("scoped token fallback discovers only the validated site's cloud ID", async () => {
  const calls: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); calls.push(url)
    if (url === `${credentials.siteUrl}/wiki/rest/api/user/current`) return json({}, 401)
    if (url.endsWith("/_edge/tenant_info")) { assert.equal(new Headers(init?.headers).get("authorization"), null); return json({ cloudId: "e4af54a2-8637-4757-a68c-16a2d73c5362" }) }
    assert.ok(url.startsWith("https://api.atlassian.com/ex/confluence/e4af54a2-8637-4757-a68c-16a2d73c5362/wiki/"))
    return json({ accountId: "account-1", displayName: "Test" })
  }
  assert.equal((await new ConfluenceClient(credentials, fetcher).authenticate()).accountId, "account-1")
  assert.equal(calls.length, 3)
})

test("pagination remains on the fixed provider endpoint and advances cursors", async () => {
  let calls = 0
  const client = new ConfluenceClient(credentials, async input => {
    const url = new URL(String(input)); calls++
    assert.equal(url.pathname, "/wiki/api/v2/spaces")
    return json({ results: [{ id: String(calls), key: `S${calls}`, name: `Space ${calls}`, type: calls === 1 ? "personal" : "global" }], _links: calls === 1 ? { next: "/wiki/api/v2/spaces?cursor=second" } : {} })
  })
  const first = await client.spaces(); assert.equal(first.cursor, "second"); assert.equal(first.data[0].type, "personal")
  assert.equal((await client.spaces(first.cursor)).cursor, null)
  const hostile = new ConfluenceClient(credentials, async () => json({ results: [], _links: { next: "https://attacker.invalid/steal?cursor=x" } }))
  await assert.rejects(hostile.spaces(), /pagination target/)
})

test("a scoped content token can connect without inventing an identity when the legacy user endpoint rejects its scope", async () => {
  const client = new ConfluenceClient(credentials, async input => {
    const url = new URL(String(input))
    if (url.pathname === "/_edge/tenant_info") return json({ cloudId: "e4af54a2-8637-4757-a68c-16a2d73c5362" })
    if (url.pathname.endsWith("/user/current")) return json({ message: "Unauthorized; scope does not match" }, 401)
    assert.equal(url.hostname, "api.atlassian.com")
    assert.ok(url.pathname.endsWith("/wiki/api/v2/spaces"))
    return json({ results: [], _links: {} })
  })
  assert.deepEqual(await client.authenticate(), { accountId: null, displayName: credentials.email })
})

test("download redirects strip authorization and reject arbitrary hosts", async () => {
  let calls = 0
  const attachment = { id: "att1", title: "file.txt", mediaType: "text/plain", fileSize: 3, status: "current", version: { number: 7 }, downloadLink: "/wiki/download/attachments/1/file.txt" }
  const client = new ConfluenceClient(credentials, async (input, init) => {
    calls++
    if (calls === 1) { assert.equal(new URL(String(input)).searchParams.get("version"), "7"); assert.ok(new Headers(init?.headers).get("authorization")); return new Response(null, { status: 302, headers: { location: "https://api.media.atlassian.com/file/1/binary?signature=test" } }) }
    assert.equal(new Headers(init?.headers).get("authorization"), null)
    return new Response("abc")
  })
  assert.equal((await client.download(attachment)).bytes.byteLength, 3)
  const hostile = new ConfluenceClient(credentials, async () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid/file" } }))
  await assert.rejects(hostile.download(attachment), /outside the supported/)
})

test("unavailable pages and attachment byte mismatches remain qualified", async () => {
  const archive = await run(async (input, init) => {
    const path = new URL(String(input)).pathname
    if (path === "/wiki/api/v2/pages/102") return json({}, 404)
    if (path.startsWith("/wiki/download/")) return new Response("short")
    return demoFetch(input, init)
  })
  assert.equal(archive.manifest.counts.capturedDocuments, 2)
  assert.equal(archive.manifest.counts.assets, 0)
  assert.equal(archive.manifest.result, "ready_with_gaps")
  assert.equal(archive.manifest.capabilities.assets.status, "partial")
  assert.ok(archive.findings.some(finding => finding.code === "inventory_gap"))
})

test("scoped attachments use the authenticated gateway and native attachment ID, then drop credentials at the media host", async () => {
  const client = new ConfluenceClient(credentials, async (input, init) => {
    const url = new URL(String(input))
    if (url.origin === credentials.siteUrl && url.pathname.endsWith("/user/current")) return json({}, 401)
    if (url.pathname === "/_edge/tenant_info") return json({ cloudId: "e4af54a2-8637-4757-a68c-16a2d73c5362" })
    if (url.pathname.endsWith("/user/current")) return json({ accountId: "test-account" })
    if (url.hostname === "api.media.atlassian.com") { assert.equal(new Headers(init?.headers).get("authorization"), null); return new Response("abc") }
    assert.equal(url.hostname, "api.atlassian.com")
    assert.ok(url.pathname.endsWith("/wiki/rest/api/content/1/child/attachment/att17/download"))
    assert.equal(url.searchParams.get("version"), "7")
    assert.ok(new Headers(init?.headers).get("authorization"))
    return new Response(null, { status: 302, headers: { location: "https://api.media.atlassian.com/file/fixture/binary" } })
  })
  await client.authenticate()
  const file = await client.download({ id: "att17", pageId: "1", title: "test.txt", status: "current", mediaType: "text/plain", fileSize: 3, version: { number: 7 }, downloadLink: "/rest/api/content/1/child/attachment/att17/download" })
  assert.equal(new TextDecoder().decode(file.bytes), "abc")
  assert.equal(file.sourceUrl, `${credentials.siteUrl}/wiki/rest/api/content/1/child/attachment/att17/download?version=7`)
})

test("an entirely unavailable selection cannot publish an empty successful archive", async () => {
  await assert.rejects(run(async (input, init) => /\/pages\/\d+$/.test(new URL(String(input)).pathname) ? json({}, 404) : demoFetch(input, init)), /None of the selected pages/)
})

test("source edits after selection are recorded rather than silently treated as unchanged", async () => {
  const archive = await run(async (input, init) => {
    const response = await demoFetch(input, init)
    if (new URL(String(input)).pathname === "/wiki/api/v2/pages/101") {
      const value = await response.json(); value.version.number = 2; return json(value)
    }
    return response
  })
  assert.ok(archive.findings.some(finding => finding.code === "inventory_gap" && finding.message.includes("actual revision 2")))
})

test("cancellation aborts in-flight source retrieval and cannot finish an archive", async () => {
  const controller = new AbortController()
  const client = new ConfluenceClient(credentials, async (input, init) => {
    if (new URL(String(input)).pathname === "/wiki/api/v2/pages/101") {
      controller.abort()
      assert.equal(init?.signal?.aborted, true)
      throw new Error("aborted")
    }
    return demoFetch(input, init)
  })
  const space = (await client.spaces()).data[0]
  const pages = (await client.pages(space.id)).data
  await assert.rejects(capturePages({ client, accountId: "test", captureId: "cancelled", organizationId: "test", space, pages, includeAttachments: true, signal: controller.signal, onProgress() {} }), /cancelled/)
})

test("429 and malformed provider replies produce actionable bounded errors", async () => {
  await assert.rejects(new ConfluenceClient(credentials, async () => json({ secret: "do not expose" }, 429)).spaces(), error => error instanceof Error && error.message.includes("limiting requests") && !error.message.includes("secret"))
  await assert.rejects(new ConfluenceClient(credentials, async () => new Response("<html>login</html>")).spaces(), /unsupported response/)
})


test("hosted source mode retains the bounded scope and verifies independently", async () => {
  const client = new ConfluenceClient(credentials, demoFetch)
  const account = await client.authenticate()
  const space = (await client.spaces()).data[0]
  const pages = (await client.pages(space.id)).data
  const archive = await capturePages({ client, accountId: account.accountId, space, pages, mode: "live", hosted: true, captureId: "hosted-test", organizationId: "test-owner", includeAttachments: true, signal: new AbortController().signal, onProgress() {} })
  assert.equal(archive.manifest.sourceMode, "live_hosted")
  assert.equal(archive.manifest.sourceAdapter, "confluence-cloud-hosted")
  assert.equal(archive.manifest.recoveryPointEligible, false)
  assert.equal((await verifyArchive(archive.files)).ok, true)
  assert.match(new TextDecoder().decode(archive.files.get("README.md")), /Hosted Confluence Cloud MVP/)
})


test("provider fetch preserves the runtime global receiver", async () => {
  let called = false
  const nativeLike: typeof fetch = async function (this: unknown, input, init) {
    assert.equal(this, globalThis)
    called = true
    return demoFetch(input, init)
  }
  const client = new ConfluenceClient(credentials, nativeLike)
  assert.ok((await client.authenticate()).displayName)
  assert.ok(called)
})

test("a fresh hosted client retains the scoped gateway without sending credentials to a supplied host", async () => {
  const cloudId = "e4af54a2-8637-4757-a68c-16a2d73c5362"
  const calls: string[] = []
  const client = new ConfluenceClient({ ...credentials, cloudId }, async input => {
    calls.push(String(input))
    const url = new URL(String(input))
    assert.equal(url.origin, "https://api.atlassian.com")
    assert.ok(url.pathname.startsWith(`/ex/confluence/${cloudId}/wiki/api/v2/`))
    return json({ results: [{ id: "1", key: "TEST", name: "Test" }], _links: {} })
  })
  assert.equal(client.cloudId, cloudId)
  assert.equal((await client.spaces()).data[0].id, "1")
  assert.equal(calls.length, 1)
  assert.throws(() => new ConfluenceClient({ ...credentials, cloudId: "https://attacker.invalid/" }))
})
