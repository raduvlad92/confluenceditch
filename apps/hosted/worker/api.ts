import { z } from "zod"
import { ConfluenceClient, isConfluenceError, type Credentials } from "@confluenceditch/confluence"
import { demoFetch } from "@confluenceditch/confluence/demo"
import { body, encrypt, HttpError } from "./security"
import { connection, database, ownedCapture, publicCapture, purge, revoke, source, type Capture } from "./db"
import type { Env } from "./types"

const id = z.string().regex(/^\d+$/).max(30)
const uuid = z.uuid()
const json = (value: unknown, status=200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
async function ensureWorkflow(env: Env, record: Capture) {
  if (record.status !== "queued") return
  try { await env.CAPTURE.create({ id: record.id, params: { captureId: record.id } }) }
  catch {
    try { await (await env.CAPTURE.get(record.id)).status() }
    catch { throw new HttpError(503, "The takeout is saved but could not start. Retry this action to resume it.") }
  }
}

export async function api(request: Request, env: Env, userId: string): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/takeout\//, "").split("/")
  const route = path.join("/")
  const sql = database(env)
  const connected = await connection(env,userId)
  if (route === "session" && request.method === "GET") {
    const rows = connected ? await sql`SELECT * FROM cd_captures WHERE user_id=${userId} AND connection_id=${connected.id} AND expires_at>now() ORDER BY created_at DESC LIMIT 1` : []
    const latest = rows[0] as Capture | undefined
    if (latest) await ensureWorkflow(env,latest)
    return json({ enabled: true, connection: connected?.public ?? null, capture: latest ? await publicCapture(env,latest) : null })
  }
  if (route === "session" && request.method === "DELETE") {
    await revoke(env,userId)
    return json({ disconnected: true })
  }
  if (route === "connect" && request.method === "POST") {
    const input = z.discriminatedUnion("mode", [z.object({ mode:z.literal("demo") }), z.object({ mode:z.literal("live"),siteUrl:z.string().max(300),email:z.email().max(300),token:z.string().min(1).max(4096) })]).parse(await body(request))
    const credentials: Credentials = input.mode === "demo" ? {siteUrl:"https://sample.atlassian.net",email:"sample@example.invalid",token:"synthetic-not-a-token"} : input
    const client = new ConfluenceClient(credentials,input.mode === "demo" ? demoFetch : fetch)
    const account = await client.authenticate()
    const connectionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now()+24*60*60*1000).toISOString()
    const value = {mode:input.mode,siteUrl:client.siteUrl,displayName:account.displayName,expiresAt}
    const encrypted = await encrypt({...credentials,siteUrl:client.siteUrl,cloudId:client.cloudId},env.CREDENTIAL_KEY,`${userId}:${connectionId}`)
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`,
      sql`UPDATE cd_connections SET revoked_at=now(),credentials='' WHERE user_id=${userId} AND revoked_at IS NULL`,
      sql`UPDATE cd_captures SET status='cancelled',generation=generation+1 WHERE user_id=${userId} AND status IN ('queued','running','ready','ready_with_gaps')`,
      sql`INSERT INTO cd_connections(id,user_id,mode,credentials,public,account_id,expires_at) VALUES(${connectionId},${userId},${input.mode},${encrypted},${JSON.stringify(value)}::jsonb,${account.accountId},${expiresAt})`,
    ])
    return json({connection:value})
  }
  if (!connected) throw new HttpError(401,"Your Confluence connection expired. Connect again to continue.")
  if (route === "spaces" && request.method === "GET") {
    const cursor=z.string().max(4000).nullable().parse(url.searchParams.get("cursor"))
    const result=await (await source(env,connected)).spaces(cursor)
    return json({spaces:result.data,cursor:result.cursor})
  }
  if (route === "pages" && request.method === "GET") {
    const spaceId=id.parse(url.searchParams.get("spaceId"))
    const cursor=z.string().max(4000).nullable().parse(url.searchParams.get("cursor"))
    const result=await (await source(env,connected)).pages(spaceId,cursor)
    return json({pages:result.data.filter(page=>page.spaceId===spaceId),cursor:result.cursor})
  }
  if (route === "captures" && request.method === "POST") {
    const input=z.object({spaceId:id,pageIds:z.array(id).min(1).max(20).refine(ids=>new Set(ids).size===ids.length),includeAttachments:z.boolean()}).parse(await body(request,8000))
    const command=uuid.parse(request.headers.get("idempotency-key"))
    const fingerprint=JSON.stringify({...input,pageIds:[...input.pageIds].sort()})
    const retry = async (): Promise<Response | null> => {
      const rows=await sql`SELECT * FROM cd_captures WHERE user_id=${userId} AND command_id=${command}`
      if(!rows.length) return null
      if(rows[0].fingerprint!==fingerprint || rows[0].connection_id!==connected.id) throw new HttpError(409,"This command was already used for a different selection or connection.")
      const record=await ownedCapture(env,userId,rows[0].id)
      await ensureWorkflow(env,record)
      return json({capture:await publicCapture(env,record)},202)
    }
    const prior=await retry()
    if(prior) return prior
    const quota=await sql`SELECT count(*) FILTER(WHERE user_id=${userId})::int AS own,count(*)::int AS total,bool_or(user_id=${userId} AND status IN ('queued','running')) AS active FROM cd_captures WHERE created_at>now()-interval '24 hours'`
    if(quota[0].own>=5 || quota[0].total>=30 || quota[0].active) {
      // Another request may have committed the same command after the first lookup.
      const concurrent=await retry()
      if(concurrent) return concurrent
      throw new HttpError(429,"The MVP allows one active export and five exports per account per day, with a shared daily limit. Try again later.")
    }
    const client=await source(env,connected)
    const space=(await client.space(input.spaceId)).data
    const pages=[]
    for(const pageId of input.pageIds) {
      const page=(await client.page(pageId)).data
      if(page.spaceId!==space.id || page.status!=="current" || page.subtype==="live") throw new HttpError(400,"Reload the page list and select published pages from one space.")
      pages.push({id:page.id,title:page.title,spaceId:page.spaceId,status:page.status,subtype:page.subtype,version:page.version})
    }
    const captureId=crypto.randomUUID()
    const selection=JSON.stringify({space,pages,includeAttachments:input.includeAttachments})
    const progress=JSON.stringify({phase:"retrieving",pagesDone:0,pagesFailed:0,pagesTotal:pages.length,assetsDone:0})
    try {
      const result=await sql.transaction([
        sql`SELECT pg_advisory_xact_lock(20261111)`,
        sql`INSERT INTO cd_captures(id,user_id,connection_id,command_id,fingerprint,selection,status,progress,expires_at) SELECT ${captureId},${userId},${connected.id},${command},${fingerprint},${selection}::jsonb,'queued',${progress}::jsonb,${connected.expires_at} FROM cd_connections c WHERE c.id=${connected.id} AND c.user_id=${userId} AND c.revoked_at IS NULL AND c.expires_at>now() AND (SELECT count(*) FROM cd_captures WHERE user_id=${userId} AND created_at>now()-interval '24 hours')<5 AND (SELECT count(*) FROM cd_captures WHERE created_at>now()-interval '24 hours')<30 ON CONFLICT(user_id,command_id) DO NOTHING RETURNING *`,
      ])
      const record=(result[1][0] ?? (await sql`SELECT * FROM cd_captures WHERE user_id=${userId} AND command_id=${command}`)[0]) as Capture | undefined
      if(!record) throw new HttpError(429,"The daily export limit was reached or the connection expired.")
      if(record.fingerprint!==fingerprint || record.connection_id!==connected.id) throw new HttpError(409,"This command was already used for a different selection.")
      await ensureWorkflow(env,record)
      return json({capture:await publicCapture(env,record)},202)
    } catch(error) {
      if(error instanceof HttpError) throw error
      if(typeof error==="object" && error && "code" in error && error.code==="23505") throw new HttpError(409,"An export is already running. Refresh to see its progress.")
      throw error
    }
  }
  if(path[0]==="captures" && path[1]) {
    const record=await ownedCapture(env,userId,uuid.parse(path[1]))
    if(path.length===2 && request.method==="GET") {await ensureWorkflow(env,record); return json({capture:await publicCapture(env,record)})}
    if(path.length===2 && request.method==="DELETE") {
      await sql`UPDATE cd_captures SET status='cancelled',generation=generation+1 WHERE id=${record.id} AND user_id=${userId} AND status IN ('queued','running')`
      try {await (await env.CAPTURE.get(record.id)).terminate()} catch { /* Publication is already fenced in the database. */ }
      return json({capture:await publicCapture(env,await ownedCapture(env,userId,record.id))})
    }
    if(path.length===3 && request.method==="GET" && ["ready","ready_with_gaps"].includes(record.status) && record.artifact_prefix) {
      const headers: Record<string,string>={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}
      if(path[2]==="download") {
        const object=await env.ARCHIVES.get(`${record.artifact_prefix}/archive.zip`)
        if(!object) throw new HttpError(404,"Archive not found.")
        return new Response(object.body,{headers:{...headers,"Content-Type":"application/zip","Content-Disposition":`attachment; filename="confluence-takeout-${record.id.slice(0,8)}.zip"`}})
      }
      const target=url.searchParams.get("path")??""
      const published=await publicCapture(env,record)
      const entry=published.result?.files.find(file=>file.path===target)
      if(!entry) throw new HttpError(404,"File is not part of this takeout.")
      const object=await env.ARCHIVES.get(`${record.artifact_prefix}/files/${entry.path}`)
      if(!object) throw new HttpError(404,"File not found.")
      if(path[2]==="document" && entry.mediaType==="text/markdown") return json({markdown:await object.text()})
      if(path[2]==="file") {
        const image=["image/png","image/jpeg","image/gif","image/webp","image/avif"].includes(entry.mediaType)
        const filename=target.split("/").at(-1)!.replace(/[^a-zA-Z0-9._-]/g,"_")
        return new Response(object.body,{headers:{...headers,"Content-Type":image?entry.mediaType:"application/octet-stream","Content-Disposition":`${image?"inline":"attachment"}; filename="${filename}"`}})
      }
    }
  }
  throw new HttpError(404,"This action is not available.")
}
