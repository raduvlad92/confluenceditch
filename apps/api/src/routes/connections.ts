import type { FastifyInstance } from "fastify"
import { prisma } from "../lib/prisma"
import { encrypt } from "../lib/crypto"
import { getConfluenceSpaces } from "../lib/confluence"
import { getNotionTopLevelPages } from "../lib/notion"

const ATLASSIAN_AUTH_URL = "https://auth.atlassian.com/authorize"
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"

export async function connectionsRoutes(app: FastifyInstance) {
  // ─── Confluence ────────────────────────────────────────────────────────────

  app.get("/connections/confluence", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const connections = await prisma.confluenceConnection.findMany({
      where: { userId: session.user.id },
      select: {
        id: true, userId: true, cloudId: true, siteUrl: true,
        siteName: true, status: true, scopes: true, createdAt: true, updatedAt: true,
      },
    })
    return { data: connections }
  })

  app.post("/connections/confluence/oauth/start", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString("base64url")
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: process.env.ATLASSIAN_CLIENT_ID!,
      scope: "read:confluence-content.all read:confluence-space.summary read:confluence-user offline_access",
      redirect_uri: process.env.ATLASSIAN_REDIRECT_URI!,
      state,
      response_type: "code",
      prompt: "consent",
    })

    return { data: { url: `${ATLASSIAN_AUTH_URL}?${params}` } }
  })

  app.get("/connections/confluence/oauth/callback", async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }

    let userId: string
    try {
      userId = JSON.parse(Buffer.from(state, "base64url").toString()).userId
    } catch {
      return reply.status(400).send({ error: { code: "INVALID_STATE", message: "Invalid OAuth state" } })
    }

    const tokenRes = await fetch(ATLASSIAN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: process.env.ATLASSIAN_CLIENT_ID,
        client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ATLASSIAN_REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      return reply.status(400).send({ error: { code: "TOKEN_EXCHANGE_FAILED", message: "Failed to exchange code" } })
    }

    const tokens = await tokenRes.json()

    const resourcesRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const resources = await resourcesRes.json()

    if (!resources.length) {
      return reply.status(400).send({ error: { code: "NO_RESOURCES", message: "No Confluence sites found" } })
    }

    for (const resource of resources) {
      await prisma.confluenceConnection.upsert({
        where: { userId_cloudId: { userId, cloudId: resource.id } },
        create: {
          userId,
          cloudId: resource.id,
          siteUrl: resource.url,
          siteName: resource.name,
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: tokens.scope.split(" "),
          status: "active",
        },
        update: {
          siteUrl: resource.url,
          siteName: resource.name,
          accessToken: encrypt(tokens.access_token),
          refreshToken: encrypt(tokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scopes: tokens.scope.split(" "),
          status: "active",
        },
      })
    }

    return reply.redirect(`${process.env.WEB_URL}/dashboard/connections?confluence=connected`)
  })

  app.delete("/connections/confluence/:id", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    await prisma.confluenceConnection.deleteMany({ where: { id, userId: session.user.id } })
    return reply.status(204).send()
  })

  app.get("/connections/confluence/:id/spaces", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const conn = await prisma.confluenceConnection.findFirst({ where: { id, userId: session.user.id } })
    if (!conn) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Connection not found" } })

    const spaces = await getConfluenceSpaces(id, conn.cloudId)
    return { data: spaces }
  })

  // ─── Notion ────────────────────────────────────────────────────────────────

  app.get("/connections/notion", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const connections = await prisma.notionConnection.findMany({
      where: { userId: session.user.id },
      select: {
        id: true, userId: true, workspaceId: true, workspaceName: true,
        workspaceIcon: true, status: true, createdAt: true, updatedAt: true,
      },
    })
    return { data: connections }
  })

  app.post("/connections/notion/oauth/start", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const state = Buffer.from(JSON.stringify({ userId: session.user.id })).toString("base64url")
    const params = new URLSearchParams({
      client_id: process.env.NOTION_CLIENT_ID!,
      redirect_uri: process.env.NOTION_REDIRECT_URI!,
      response_type: "code",
      owner: "user",
      state,
    })

    return { data: { url: `${NOTION_AUTH_URL}?${params}` } }
  })

  app.get("/connections/notion/oauth/callback", async (req, reply) => {
    const { code, state } = req.query as { code: string; state: string }

    let userId: string
    try {
      userId = JSON.parse(Buffer.from(state, "base64url").toString()).userId
    } catch {
      return reply.status(400).send({ error: { code: "INVALID_STATE", message: "Invalid OAuth state" } })
    }

    const credentials = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
    ).toString("base64")

    const tokenRes = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      }),
    })

    if (!tokenRes.ok) {
      return reply.status(400).send({ error: { code: "TOKEN_EXCHANGE_FAILED", message: "Failed to exchange code" } })
    }

    const tokens = await tokenRes.json()

    await prisma.notionConnection.upsert({
      where: { userId_workspaceId: { userId, workspaceId: tokens.workspace_id } },
      create: {
        userId,
        workspaceId: tokens.workspace_id,
        workspaceName: tokens.workspace_name,
        workspaceIcon: tokens.workspace_icon,
        accessToken: encrypt(tokens.access_token),
        botId: tokens.bot_id,
        status: "active",
      },
      update: {
        workspaceName: tokens.workspace_name,
        workspaceIcon: tokens.workspace_icon,
        accessToken: encrypt(tokens.access_token),
        botId: tokens.bot_id,
        status: "active",
      },
    })

    return reply.redirect(`${process.env.WEB_URL}/dashboard/connections?notion=connected`)
  })

  app.delete("/connections/notion/:id", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    await prisma.notionConnection.deleteMany({ where: { id, userId: session.user.id } })
    return reply.status(204).send()
  })

  app.get("/connections/notion/:id/pages", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const conn = await prisma.notionConnection.findFirst({ where: { id, userId: session.user.id } })
    if (!conn) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Connection not found" } })

    const pages = await getNotionTopLevelPages(id)
    return { data: pages }
  })
}
