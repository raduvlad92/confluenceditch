import { Worker, type Job } from "bullmq"
import { getRedis } from "../lib/redis"
import { prisma } from "../lib/prisma"
import { getPagePushQueue } from "./queues"
import { convertConfluenceToNotion } from "./converter/confluenceToNotion"
import type { PageConvertJobData, PagePushJobData } from "@confluenceditch/types"

export function createPageConvertWorker() {
  return new Worker<PageConvertJobData>(
    "page-convert",
    async (job: Job<PageConvertJobData>) => {
      const { migrationId, pageMappingId, confluencePageId, rawHtml, title } = job.data

      const migration = await prisma.migration.findUnique({
        where: { id: migrationId },
        select: { status: true, userId: true },
      })

      if (!migration || ["cancelled", "paused"].includes(migration.status)) return

      let blocks: unknown[]
      try {
        blocks = convertConfluenceToNotion(rawHtml)
      } catch (err) {
        await prisma.pageMapping.update({
          where: { id: pageMappingId },
          data: {
            status: "failed",
            errorMessage: `Conversion failed: ${String(err)}`,
          },
        })
        await prisma.migration.update({
          where: { id: migrationId },
          data: { pagesFailed: { increment: 1 } },
        })
        return
      }

      const pushJob: PagePushJobData = {
        migrationId,
        pageMappingId,
        confluencePageId,
        title,
        blocks,
        userId: migration.userId,
      }

      const pushQueue = getPagePushQueue()
      await pushQueue.add("push-page", pushJob, {
        jobId: `push-${pageMappingId}`,
      })
    },
    {
      connection: getRedis(),
      concurrency: 20, // CPU-bound but light — can parallelize more
    }
  )
}
