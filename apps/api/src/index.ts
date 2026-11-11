import Fastify from "fastify"
import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import { fromNodeHeaders } from "better-auth/node"
import { auth } from "./lib/auth"
import { connectionsRoutes } from "./routes/connections"
import { migrationsRoutes } from "./routes/migrations"
import { adminRoutes } from "./routes/admin"

type SessionUser = { id: string; email: string; name: string; role: string }
type SessionInfo = { user: SessionUser; session: { userId: string } }

declare module "fastify" {
  interface FastifyRequest {
    getSession(): Promise<SessionInfo | null>
  }
}

const app = Fastify({ logger: process.env.NODE_ENV !== "production" })

app.register(cors, {
  origin: process.env.WEB_URL,
  credentials: true,
})

app.register(cookie)

app.decorateRequest("getSession", async function () {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(this.headers),
  })
  return session as SessionInfo | null
})

// Bridge Fastify → Fetch API so better-auth can read the already-parsed body
app.all("/api/auth/*", async (req, reply) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`)
  const headers = new Headers()
  for (const [key, val] of Object.entries(req.headers)) {
    if (val != null) headers.set(key, Array.isArray(val) ? val.join(", ") : val)
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body != null
  const request = new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body) : undefined,
  })

  const response = await auth.handler(request)

  reply.status(response.status)
  response.headers.forEach((val, key) => reply.header(key, val))
  reply.send(Buffer.from(await response.arrayBuffer()))
})

app.register(
  async (v1) => {
    v1.register(connectionsRoutes)
    v1.register(migrationsRoutes)
    v1.register(adminRoutes)
  },
  { prefix: "/api/v1" }
)

app.get("/health", () => ({ ok: true }))

const port = parseInt(process.env.PORT ?? "3001")
app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
  console.log(`API running on port ${port}`)
})
