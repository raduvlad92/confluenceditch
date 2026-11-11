import { Worker, type Job } from "bullmq"
import { getRedis } from "../lib/redis"
import { prisma, type Prisma } from "../lib/prisma"
import { confluenceFetch } from "../lib/confluence"
import { getPagePullQueue, getAttachmentPullQueue } from "./queues"
import type { OrchestratorJobData, PagePullJobData } from "@confluenceditch/types"

interface ConfluencePage {
  id: string
  title: string
  ancestors: Array<{ id: string }>
  space: { key: string }
}

async function fetchAllPagesInSpace(
  connectionId: string,
  cloudId: string,
  spaceKey: string
): Promise<ConfluencePage[]> {
  const pages: ConfluencePage[] = []
  let start = 0
  const limit = 50

  while (true) {
    const res = await confluenceFetch(
      connectionId,
      cloudId,
      `/content?type=page&spaceKey=${spaceKey}&start=${start}&limit=${limit}&expand=ancestors,space`
    )

    if (!res.ok) throw new Error(`Failed to fetch pages for space ${spaceKey}: ${res.status}`)

    const json = await res.json()
    pages.push(...json.results)

    if (json.results.length < limit) break
    start += limit
  }

  return pages
}

async function logMigration(
  migrationId: string,
  level: "info" | "warn" | "error",
  message: string,
  metadata?: Record<string, unknown>
) {
  await prisma.migrationLog.create({
    data: { migrationId, level, message, metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined },
  })
}

export function createOrchestratorWorker() {
  return new Worker<OrchestratorJobData>(
    "migration-orchestrator",
    async (job: Job<OrchestratorJobData>) => {
      const { migrationId } = job.data

      const migration = await prisma.migration.findUniqueOrThrow({
        where: { id: migrationId },
        include: { confluenceConnection: true },
      })

      if (migration.status === "cancelled") {
        await logMigration(migrationId, "info", "Migration cancelled before orchestration started")
        return
      }

      const { cloudId, id: connectionId } = migration.confluenceConnection
      const options = migration.options as { includeAttachments: boolean; dryRun: boolean }

      await logMigration(migrationId, "info", `Starting orchestration for ${migration.spaceKeys.length} space(s)`)

      let totalPages = 0
      const allPages: (ConfluencePage & { spaceKey: string })[] = []

      // Collect all pages from all spaces
      for (const spaceKey of migration.spaceKeys) {
        try {
          const pages = await fetchAllPagesInSpace(connectionId, cloudId, spaceKey)
          allPages.push(...pages.map((p) => ({ ...p, spaceKey })))
          totalPages += pages.length
          await logMigration(migrationId, "info", `Found ${pages.length} pages in space ${spaceKey}`)
        } catch (err) {
          await logMigration(migrationId, "error", `Failed to fetch pages from space ${spaceKey}`, {
            error: String(err),
          })
          throw err
        }
      }

      // Upsert page mappings (skip already-processed pages for retry runs)
      const existingMappings = await prisma.pageMapping.findMany({
        where: { migrationId },
        select: { confluencePageId: true },
      })
      const existingIds = new Set(existingMappings.map((m) => m.confluencePageId))

      const newPages = allPages.filter((p) => !existingIds.has(p.id))

      if (newPages.length > 0) {
        await prisma.pageMapping.createMany({
          data: newPages.map((p) => ({
            migrationId,
            confluencePageId: p.id,
            confluenceSpaceKey: p.spaceKey,
            confluenceTitle: p.title,
            confluenceParentId: p.ancestors[p.ancestors.length - 1]?.id ?? null,
            status: "pending",
          })),
          skipDuplicates: true,
        })
      }

      // Update total count
      await prisma.migration.update({
        where: { id: migrationId },
        data: { pagesTotal: totalPages },
      })

      // Fan out: enqueue one pull job per pending page
      const pendingMappings = await prisma.pageMapping.findMany({
        where: { migrationId, status: "pending" },
        select: { id: true, confluencePageId: true },
      })

      const pullQueue = getPagePullQueue()
      const pullJobs: PagePullJobData[] = pendingMappings.map((m) => ({
        migrationId,
        pageMappingId: m.id,
        confluencePageId: m.confluencePageId,
        cloudId,
        userId: migration.userId,
      }))

      // Add in batches to avoid Redis memory spikes
      const BATCH_SIZE = 100
      for (let i = 0; i < pullJobs.length; i += BATCH_SIZE) {
        const batch = pullJobs.slice(i, i + BATCH_SIZE)
        await pullQueue.addBulk(
          batch.map((data) => ({
            name: "pull-page",
            data,
            opts: { jobId: `pull-${data.pageMappingId}` },
          }))
        )
      }

      if (options.includeAttachments) {
        // Attachment jobs are enqueued by the pagePush worker after each page is created
        await logMigration(migrationId, "info", "Attachments will be processed after each page is pushed")
      }

      await logMigration(
        migrationId,
        "info",
        `Orchestration complete. Enqueued ${pullJobs.length} page pull jobs.`
      )
    },
    {
      connection: getRedis(),
      concurrency: 2,
    }
  )
}
