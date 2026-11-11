import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"
import { GET, POST, DELETE } from "../src/app/api/local/[...path]/route"

process.env.CONFLUENCE_LOCAL_TEST = "1"
async function invoke(path: string, method = "GET", body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  const request = new NextRequest(`http://localhost:3000/api/local/${path}`, {
    method, headers: { "content-type": "application/json", "x-confluenceditch-client": "local-ui", ...(cookie ? { cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return (method === "POST" ? POST : method === "DELETE" ? DELETE : GET)(request, { params: Promise.resolve({ path: path.split("?")[0].split("/") }) })
}
async function connection() {
  const response = await invoke("connect", "POST", { mode: "demo" })
  assert.equal(response.status, 200)
  const cookie = response.headers.get("set-cookie")!.split(";")[0]
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/i)
  assert.match(response.headers.get("set-cookie")!, /SameSite=strict/i)
  const spaces = await (await invoke("spaces", "GET", undefined, cookie)).json()
  const spaceId = spaces.spaces[0].id
  const pages = await (await invoke(`pages?spaceId=${spaceId}`, "GET", undefined, cookie)).json()
  return { cookie, spaceId, pageIds: pages.pages.map((page: { id: string }) => page.id) }
}
async function finish(cookie: string, id: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await (await invoke(`captures/${id}`, "GET", undefined, cookie)).json()
    if (!["queued", "running"].includes(result.capture.status)) return result.capture
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error("Synthetic capture did not settle")
}

test("repeated create commands converge, and a downloaded ZIP stays bound to its session", async () => {
  const first = await connection()
  const key = crypto.randomUUID()
  const body = { spaceId: first.spaceId, pageIds: first.pageIds, includeAttachments: true }
  const created = await (await invoke("captures", "POST", body, first.cookie, { "idempotency-key": key })).json()
  const duplicate = await (await invoke("captures", "POST", body, first.cookie, { "idempotency-key": key })).json()
  assert.equal(created.capture.id, duplicate.capture.id)
  assert.equal((await invoke("captures", "POST", { ...body, pageIds: first.pageIds.slice(0, 1) }, first.cookie, { "idempotency-key": key })).status, 409)
  const capture = await finish(first.cookie, created.capture.id)
  assert.equal(capture.status, "ready_with_gaps")
  assert.equal(capture.pagesDone, 3)
  assert.equal(capture.assetsDone, 1)
  const second = await connection()
  assert.equal((await invoke(`captures/${capture.id}/download`, "GET", undefined, second.cookie)).status, 404)
  const download = await invoke(`captures/${capture.id}/download`, "GET", undefined, first.cookie)
  assert.equal(download.headers.get("content-type"), "application/zip")
  assert.equal(download.headers.get("cache-control"), "private, no-store")
  assert.ok((await download.arrayBuffer()).byteLength > 1000)
  assert.equal((await invoke("session", "DELETE", undefined, first.cookie)).status, 200)
  assert.equal((await invoke(`captures/${capture.id}/download`, "GET", undefined, first.cookie)).status, 401)
  await invoke("session", "DELETE", undefined, second.cookie)
})

test("cross-origin writes, guessed sessions and unselected IDs fail closed", async () => {
  assert.equal((await invoke("connect", "POST", { mode: "demo" }, undefined, { origin: "https://attacker.invalid" })).status, 403)
  assert.equal((await invoke("spaces", "GET", undefined, "cd_local_session=guessed")).status, 401)
  const session = await connection()
  assert.equal((await invoke("captures", "POST", { spaceId: session.spaceId, pageIds: ["99999"], includeAttachments: true }, session.cookie, { "idempotency-key": crypto.randomUUID() })).status, 400)
  await invoke("session", "DELETE", undefined, session.cookie)
})

test("cancellation prevents a late task from publishing a result", async () => {
  const session = await connection()
  const created = await (await invoke("captures", "POST", { spaceId: session.spaceId, pageIds: session.pageIds, includeAttachments: true }, session.cookie, { "idempotency-key": crypto.randomUUID() })).json()
  await invoke(`captures/${created.capture.id}`, "DELETE", undefined, session.cookie)
  const capture = await finish(session.cookie, created.capture.id)
  assert.equal(capture.status, "cancelled")
  assert.equal(capture.result, undefined)
  assert.equal((await invoke(`captures/${capture.id}/download`, "GET", undefined, session.cookie)).status, 404)
  await invoke("session", "DELETE", undefined, session.cookie)
})
