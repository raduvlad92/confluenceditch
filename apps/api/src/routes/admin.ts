import type { FastifyInstance } from "fastify"
import { prisma } from "../lib/prisma"

type MigrationStatusFilter = "pending" | "running" | "paused" | "completed" | "completed_with_errors" | "failed" | "cancelled"

export async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    const session = await req.getSession()
    if (!session) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Not authenticated" } })

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (user?.role !== "owner") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Admin access required" } })
    }
  })

  app.get("/admin/stats", async () => {
    const [totalUsers, totalMigrations, activeMigrations, failedPages, totalPages] =
      await Promise.all([
        prisma.user.count(),
        prisma.migration.count(),
        prisma.migration.count({ where: { status: "running" } }),
        prisma.pageMapping.count({ where: { status: "failed" } }),
        prisma.pageMapping.count({ where: { status: "done" } }),
      ])

    const failureRate = totalPages + failedPages > 0
      ? failedPages / (totalPages + failedPages)
      : 0

    return { data: { totalUsers, totalMigrations, totalPagesMigrated: totalPages, activeMigrations, failureRate } }
  })

  app.get("/admin/users", async (req) => {
    const { page = "1", limit = "20", q } = req.query as Record<string, string>
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const where = q ? { email: { contains: q, mode: "insensitive" as const } } : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        select: {
          id: true, email: true, name: true, role: true, createdAt: true,
          _count: { select: { migrations: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return { data: users, meta: { page: parseInt(page), limit: parseInt(limit), total } }
  })

  app.get("/admin/users/:id", async (req, reply) => {
    const { id } = req.params as { id: string }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        confluenceConnections: {
          select: { id: true, siteUrl: true, siteName: true, status: true, createdAt: true },
        },
        notionConnections: {
          select: { id: true, workspaceName: true, workspaceIcon: true, status: true, createdAt: true },
        },
        migrations: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, label: true, status: true, pagesTotal: true, pagesDone: true, pagesFailed: true, createdAt: true },
        },
      },
    })

    if (!user) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } })
    return { data: user }
  })

  app.get("/admin/migrations", async (req) => {
    const { page = "1", limit = "20", status, userId } = req.query as Record<string, string>
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where = {
      ...(status ? { status: status as MigrationStatusFilter } : {}),
      ...(userId ? { userId } : {}),
    }

    const [migrations, total] = await Promise.all([
      prisma.migration.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.migration.count({ where }),
    ])

    return { data: migrations, meta: { page: parseInt(page), limit: parseInt(limit), total } }
  })

  app.get("/admin/migrations/:id", async (req, reply) => {
    const { id } = req.params as { id: string }
    const migration = await prisma.migration.findUnique({
      where: { id },
      include: { user: { select: { email: true, name: true } } },
    })
    if (!migration) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Migration not found" } })
    return { data: migration }
  })

  app.post("/admin/migrations/:id/cancel", async (req) => {
    const { id } = req.params as { id: string }
    await prisma.migration.update({
      where: { id },
      data: { status: "cancelled", completedAt: new Date() },
    })
    return { data: { cancelled: true } }
  })
}
