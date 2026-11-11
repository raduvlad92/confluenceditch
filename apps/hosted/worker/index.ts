import { z } from "zod"
import { isConfluenceError } from "@confluenceditch/confluence"
import { authenticate, checkOrigin, HttpError } from "./security"
import { purge } from "./db"
import { api } from "./api"
import type { Env } from "./types"
export { CaptureWorkflow } from "./workflow"
const json = (value: unknown, status=200) => Response.json(value, {status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})

export default {
  async fetch(request: Request,env: Env): Promise<Response> {
    const url=new URL(request.url)
    if(url.pathname==="/health") return json({ok:true,release:env.RELEASE})
    try {
      checkOrigin(request,env.APP_ORIGIN)
      if(url.pathname.startsWith("/api/")) {
        if(!url.pathname.startsWith("/api/takeout/")) throw new HttpError(404,"Action not found.")
        if(!(await env.EDGE_RATE.limit({key:request.headers.get("cf-connecting-ip")??"unknown"})).success) throw new HttpError(429,"Too many requests. Wait a minute and try again.")
        const userId=await authenticate(request,env)
        if(!(await env.USER_RATE.limit({key:userId})).success) throw new HttpError(429,"Too many requests. Wait a minute and try again.")
        return await api(request,env,userId)
      }
      if(url.pathname==="/privacy") return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Privacy · ConfluenceDitch</title><main style="font:16px/1.7 system-ui;max-width:680px;margin:60px auto;padding:20px"><h1>Privacy & retention</h1><p>ConfluenceDitch is an early MVP. Clerk handles account sign-in. Your Confluence API token is encrypted in the database. Your selected pages, original API responses and files are stored privately in Cloudflare R2 and are accessible through your signed-in account.</p><p>Connections and exports expire 24 hours after connection. Disconnecting immediately blocks access and clears the stored credentials. Expired and disconnected files are removed by hourly cleanup, with a storage lifecycle as fallback. Operational provider backups may retain records under their own retention policies.</p><p>The connector only reads Confluence. This release captures up to 20 selected current published pages, 1 MiB per attachment and 2 MiB in attachments combined. It does not capture source history or source permissions. Downloaded ZIPs contain originals: anyone receiving your ZIP can read its contents.</p><p>Each account can run one export at a time and five per day. A shared limit of 30 exports per day protects the MVP’s operating costs.</p><p>To remove your connection and hosted exports, use Disconnect in the app. To remove your account, use the account menu.</p><a href="/">Return to the app</a></main>`,{headers:{"Content-Type":"text/html; charset=utf-8","X-Content-Type-Options":"nosniff","Cache-Control":"no-store"}})
      const response=await env.ASSETS.fetch(request)
      const headers=new Headers(response.headers)
      headers.set("X-Content-Type-Options","nosniff"); headers.set("Referrer-Policy","same-origin"); headers.set("X-Frame-Options","DENY")
      return new Response(response.body,{status:response.status,headers})
    } catch(error) {
      if(error instanceof HttpError) return json({error:error.message},error.status)
      if(isConfluenceError(error)) return json({error:error.message,code:error.code},error.status)
      if(error instanceof z.ZodError || error instanceof SyntaxError) return json({error:"Check the fields or selection and try again."},400)
      return json({error:"The action failed. Try again shortly."},500)
    }
  },
  async scheduled(_event: ScheduledController,env: Env) {await purge(env)},
}
