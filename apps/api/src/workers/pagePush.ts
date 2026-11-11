import { Worker, type Job } from "bullmq"
import { getRedis } from "../lib/redis"
import { prisma } from "../lib/prisma"
import { createNotionPage } from "../lib/notion"
import { getPagePushQueue, getAttachmentPullQueue } from "./queues"
import type { PagePushJobData } from "@confluenceditch/types"

const PARENT_WAIT_DELAY_MS = 5000
const PARENT_WAIT_MAX_RETRIES = 20

export function createPagePushWorker() {
  return new Worker<PagePushJobData>(
    "page-push",
    async (job: Job<PagePushJobData>) => {
      const { migrationId, pageMappingId, confluencePageId, title, blocks } = job.data

      const migration = await prisma.migration.findUnique({
        where: { id: migrationId },
        select: { status: true, notionConnectionId: true, options: true, notionParentId: true },
      })

      if (!migration || ["cancelled", "paused"].includes(migration.status)) return

      await prisma.pageMapping.update({
        where: { id: pageMappingId },
        data: { status: "pushing" },
      })

      // Resolve the Notion parent for this page
      const mapping = await prisma.pageMapping.findUniqueOrThrow({
        where: { id: pageMappingId },
        select: { confluenceParentId: true },
      })

      let notionParentId = migration.notionParentId // default: root of migration

      if (mapping.confluenceParentId) {
        // Find the parent's Notion page ID
        const parentMapping = await prisma.pageMapping.findUnique({
          where: {
            migrationId_confluencePageId: {
              migrationId,
              confluencePageId: mapping.confluenceParentId,
            },
          },
          select: { notionPageId: true, status: true },
        })

        if (!parentMapping || !parentMapping.notionPageId) {
          // Parent not yet pushed — re-queue with delay
          const retryCount = job.data.retryForParent
            ? (await job.attemptsMade) + 1
            : 1

          if (retryCount >= PARENT_WAIT_MAX_RETRIES) {
            // Fall back to migration root as parent
            await prisma.migrationLog.create({
              data: {
                migrationId,
                pageMappingId,
                level: "warn",
                message: `Parent page not ready after ${retryCount} retries; attaching to migration root`,
                metadata: { confluenceParentId: mapping.confluenceParentId },
              },
            })
          } else {
            // Re-queue this job with a delay
            const pushQueue = getPagePushQueue()
            await pushQueue.add(
              "push-page",
              { ...job.data, retryForParent: true },
              {
                jobId: `push-${pageMappingId}-retry-${retryCount}`,
                delay: PARENT_WAIT_DELAY_MS * Math.min(retryCount, 4),
              }
            )
            return
          }
        } else {
          notionParentId = parentMapping.notionPageId
        }
      }

      // Push to Notion
      try {
        const options = migration.options as { dryRun: boolean; includeAttachments: boolean }

        let notionPageId: string

        if (options.dryRun) {
          // Dry run: simulate success without actually creating
          notionPageId = `dry-run-${pageMappingId}`
        } else {
          notionPageId = await createNotionPage(
            migration.notionConnectionId,
            notionParentId,
            title,
            blocks as object[]
          )
        }

        await prisma.pageMapping.update({
          where: { id: pageMappingId },
          data: {
            notionPageId,
            notionParentId,
            status: "done",
          },
        })

        await prisma.migration.update({
          where: { id: migrationId },
          data: { pagesDone: { increment: 1 } },
        })

        // Enqueue attachment jobs if needed
        if (options.includeAttachments && !options.dryRun) {
          await enqueueAttachments(migrationId, pageMappingId, notionPageId, job.data)
        }

        // Check if migration is complete
        await checkMigrationCompletion(migrationId)
      } catch (err) {
        const errorMessage = String(err)

        await prisma.pageMapping.update({
          where: { id: pageMappingId },
          data: {
            status: "failed",
            errorMessage: errorMessage.slice(0, 500),
            retryCount: { increment: 1 },
          },
        })

        await prisma.migration.update({
          where: { id: migrationId },
          data: { pagesFailed: { increment: 1 } },
        })

        await prisma.migrationLog.create({
          data: {
            migrationId,
            pageMappingId,
            level: "error",
            message: `Failed to push page "${title}"`,
            metadata: { error: errorMessage, confluencePageId },
          },
        })

        throw err // Let BullMQ handle retries
      }
    },
    {
      connection: getRedis(),
      concurrency: 5,
      limiter: { max: 3, duration: 1000 }, // Notion rate limit: 3 req/sec
    }
  )
}

async function enqueueAttachments(
  migrationId: string,
  pageMappingId: string,
  notionPageId: string,
  jobData: PagePushJobData
) {
  // Attachment count is set during orchestration; fetch and enqueue here
  const mapping = await prisma.pageMapping.findUnique({
    where: { id: pageMappingId },
    select: { attachmentCount: true },
  })

  if (!mapping || mapping.attachmentCount === 0) return

  // The actual attachment pull is triggered from pagePull which already knows about attachments
  // This is a placeholder — in practice, the pull worker enqueues attachment jobs
}

async function checkMigrationCompletion(migrationId: string) {
  const migration = await prisma.migration.findUnique({
    where: { id: migrationId },
    select: { pagesTotal: true, pagesDone: true, pagesFailed: true, status: true },
  })

  if (!migration || migration.status !== "running") return

  const processed = migration.pagesDone + migration.pagesFailed
  if (processed >= migration.pagesTotal && migration.pagesTotal > 0) {
    const finalStatus = migration.pagesFailed > 0 ? "completed_with_errors" : "completed"

    await prisma.migration.update({
      where: { id: migrationId },
      data: { status: finalStatus, completedAt: new Date() },
    })

    await prisma.migrationLog.create({
      data: {
        migrationId,
        level: "info",
        message: `Migration ${finalStatus}. ${migration.pagesDone} pages migrated, ${migration.pagesFailed} failed.`,
      },
    })
  }
}
