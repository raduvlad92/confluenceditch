import { Worker, type Job } from "bullmq"
import { getRedis } from "../lib/redis"
import { prisma } from "../lib/prisma"
import { confluenceFetch } from "../lib/confluence"
import { getPageConvertQueue } from "./queues"
import type { PagePullJobData, PageConvertJobData } from "@confluenceditch/types"

export function createPagePullWorker() {
  return new Worker<PagePullJobData>(
    "page-pull",
    async (job: Job<PagePullJobData>) => {
      const { migrationId, pageMappingId, confluencePageId, cloudId } = job.data

      // Check if migration is still active
      const migration = await prisma.migration.findUnique({
        where: { id: migrationId },
        select: { status: true, confluenceConnectionId: true },
      })

      if (!migration || ["cancelled", "paused"].includes(migration.status)) return

      await prisma.pageMapping.update({
        where: { id: pageMappingId },
        data: { status: "converting" },
      })

      const res = await confluenceFetch(
        migration.confluenceConnectionId,
        cloudId,
        `/content/${confluencePageId}?expand=body.storage,metadata.labels,version`
      )

      if (!res.ok) {
        await prisma.pageMapping.update({
          where: { id: pageMappingId },
          data: { status: "failed", errorMessage: `Confluence fetch failed: ${res.status}` },
        })
        await prisma.migration.update({
          where: { id: migrationId },
          data: { pagesFailed: { increment: 1 } },
        })
        return
      }

      const page = await res.json()
      const rawHtml: string = page.body?.storage?.value ?? ""
      const title: string = page.title ?? "Untitled"
      const labels: string[] = page.metadata?.labels?.results?.map((l: { name: string }) => l.name) ?? []

      const convertJob: PageConvertJobData = {
        migrationId,
        pageMappingId,
        confluencePageId,
        rawHtml,
        title,
        labels,
      }

      const convertQueue = getPageConvertQueue()
      await convertQueue.add("convert-page", convertJob, {
        jobId: `convert-${pageMappingId}`,
      })
    },
    {
      connection: getRedis(),
      concurrency: 10,
    }
  )
}
