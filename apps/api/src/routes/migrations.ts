import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { getOrchestratorQueue } from "../workers/queues"

const CreateMigrationSchema = z.object({
  confluenceConnectionId: z.string().uuid(),
  notionConnectionId: z.string().uuid(),
  label: z.string().min(1).max(100),
  spaceKeys: z.array(z.string()).min(1),
  notionParentId: z.string().min(1),
  options: z.object({
    includeAttachments: z.boolean().default(true),
    includePermissions: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  }),
})

type PageStatus = "pending" | "converting" | "pushing" | "done" | "failed" | "skipped"
type MigrationStatusFilter = "pending" | "running" | "paused" | "completed" | "completed_with_errors" | "failed" | "cancelled"

export async function migrationsRoutes(app: FastifyInstance) {
  app.get("/migrations", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { page = "1", limit = "20" } = req.query as Record<string, string>
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [migrations, total] = await Promise.all([
      prisma.migration.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.migration.count({ where: { userId: session.user.id } }),
    ])

    return { data: migrations, meta: { page: parseInt(page), limit: parseInt(limit), total } }
  })

  app.post("/migrations", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const body = CreateMigrationSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: body.error.message } })

    const [confluenceConn, notionConn] = await Promise.all([
      prisma.confluenceConnection.findFirst({
        where: { id: body.data.confluenceConnectionId, userId: session.user.id, status: "active" },
      }),
      prisma.notionConnection.findFirst({
        where: { id: body.data.notionConnectionId, userId: session.user.id, status: "active" },
      }),
    ])

    if (!confluenceConn) return reply.status(400).send({ error: { code: "INVALID_CONFLUENCE_CONNECTION", message: "Confluence connection not found or inactive" } })
    if (!notionConn) return reply.status(400).send({ error: { code: "INVALID_NOTION_CONNECTION", message: "Notion connection not found or inactive" } })

    const migration = await prisma.migration.create({
      data: {
        userId: session.user.id,
        confluenceConnectionId: body.data.confluenceConnectionId,
        notionConnectionId: body.data.notionConnectionId,
        label: body.data.label,
        spaceKeys: body.data.spaceKeys,
        notionParentId: body.data.notionParentId,
        options: body.data.options,
        status: "pending",
      },
    })

    return reply.status(201).send({ data: migration })
  })

  app.get("/migrations/:id", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const migration = await prisma.migration.findFirst({ where: { id, userId: session.user.id } })
    if (!migration) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Migration not found" } })

    return { data: migration }
  })

  app.post("/migrations/:id/start", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const migration = await prisma.migration.findFirst({ where: { id, userId: session.user.id } })
    if (!migration) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Migration not found" } })

    if (!["pending", "paused"].includes(migration.status)) {
      return reply.status(400).send({ error: { code: "INVALID_STATE", message: `Cannot start migration in ${migration.status} state` } })
    }

    await prisma.migration.update({
      where: { id },
      data: { status: "running", startedAt: migration.startedAt ?? new Date() },
    })

    const queue = getOrchestratorQueue()
    await queue.add("orchestrate", { migrationId: id }, { jobId: `orchestrate-${id}` })

    return { data: { queued: true } }
  })

  app.post("/migrations/:id/pause", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    await prisma.migration.updateMany({
      where: { id, userId: session.user.id, status: "running" },
      data: { status: "paused" },
    })
    return { data: { paused: true } }
  })

  app.post("/migrations/:id/cancel", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    await prisma.migration.updateMany({
      where: { id, userId: session.user.id, status: { in: ["pending", "running", "paused"] } },
      data: { status: "cancelled", completedAt: new Date() },
    })
    return { data: { cancelled: true } }
  })

  app.post("/migrations/:id/retry", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const migration = await prisma.migration.findFirst({ where: { id, userId: session.user.id } })
    if (!migration) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Migration not found" } })

    await prisma.pageMapping.updateMany({
      where: { migrationId: id, status: "failed" },
      data: { status: "pending", errorMessage: null },
    })

    await prisma.migration.update({
      where: { id },
      data: { status: "running" },
    })

    const queue = getOrchestratorQueue()
    await queue.add("orchestrate-retry", { migrationId: id }, { jobId: `orchestrate-retry-${id}-${Date.now()}` })

    return { data: { queued: true } }
  })

  app.delete("/migrations/:id", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    await prisma.migration.deleteMany({ where: { id, userId: session.user.id } })
    return reply.status(204).send()
  })

  app.get("/migrations/:id/progress", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const migration = await prisma.migration.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, status: true, pagesTotal: true, pagesDone: true, pagesFailed: true, bytesTotal: true, bytesDone: true },
    })
    if (!migration) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Migration not found" } })

    return { data: migration }
  })

  app.get("/migrations/:id/pages", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const { page = "1", limit = "50", status } = req.query as Record<string, string>
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const [pages, total] = await Promise.all([
      prisma.pageMapping.findMany({
        where: {
          migrationId: id,
          migration: { userId: session.user.id },
          ...(status ? { status: status as PageStatus } : {}),
        },
        orderBy: { createdAt: "asc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.pageMapping.count({
        where: { migrationId: id, migration: { userId: session.user.id } },
      }),
    ])

    return { data: pages, meta: { page: parseInt(page), limit: parseInt(limit), total } }
  })

  app.get("/migrations/:id/logs", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const { id } = req.params as { id: string }
    const { cursor, limit = "50", level } = req.query as Record<string, string>

    const logs = await prisma.migrationLog.findMany({
      where: {
        migrationId: id,
        migration: { userId: session.user.id },
        ...(level ? { level: level as "info" | "warn" | "error" } : {}),
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
    })

    return { data: logs }
  })
}
