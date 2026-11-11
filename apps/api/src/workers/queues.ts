import { Queue } from "bullmq"
import { getRedis } from "../lib/redis"
import type {
  OrchestratorJobData,
  PagePullJobData,
  PageConvertJobData,
  PagePushJobData,
  AttachmentPullJobData,
} from "@confluenceditch/types"

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
}

let orchestratorQueue: Queue<OrchestratorJobData> | null = null
let pagePullQueue: Queue<PagePullJobData> | null = null
let pageConvertQueue: Queue<PageConvertJobData> | null = null
let pagePushQueue: Queue<PagePushJobData> | null = null
let attachmentPullQueue: Queue<AttachmentPullJobData> | null = null

export function getOrchestratorQueue() {
  if (!orchestratorQueue) {
    orchestratorQueue = new Queue("migration-orchestrator", {
      connection: getRedis(),
      defaultJobOptions,
    })
  }
  return orchestratorQueue
}

export function getPagePullQueue() {
  if (!pagePullQueue) {
    pagePullQueue = new Queue("page-pull", {
      connection: getRedis(),
      defaultJobOptions,
    })
  }
  return pagePullQueue
}

export function getPageConvertQueue() {
  if (!pageConvertQueue) {
    pageConvertQueue = new Queue("page-convert", {
      connection: getRedis(),
      defaultJobOptions,
    })
  }
  return pageConvertQueue
}

export function getPagePushQueue() {
  if (!pagePushQueue) {
    pagePushQueue = new Queue("page-push", {
      connection: getRedis(),
      defaultJobOptions,
    })
  }
  return pagePushQueue
}

export function getAttachmentPullQueue() {
  if (!attachmentPullQueue) {
    attachmentPullQueue = new Queue("attachment-pull", {
      connection: getRedis(),
      defaultJobOptions,
    })
  }
  return attachmentPullQueue
}
