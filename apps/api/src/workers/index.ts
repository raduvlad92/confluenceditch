import { createOrchestratorWorker } from "./orchestrator"
import { createPagePullWorker } from "./pagePull"
import { createPageConvertWorker } from "./pageConvert"
import { createPagePushWorker } from "./pagePush"

console.log("Starting ConfluenceDitch workers...")

const workers = [
  createOrchestratorWorker(),
  createPagePullWorker(),
  createPageConvertWorker(),
  createPagePushWorker(),
]

workers.forEach((worker) => {
  worker.on("completed", (job) => {
    console.log(`[${worker.name}] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[${worker.name}] Job ${job?.id} failed:`, err.message)
  })

  worker.on("error", (err) => {
    console.error(`[${worker.name}] Worker error:`, err)
  })
})

async function shutdown() {
  console.log("Shutting down workers...")
  await Promise.all(workers.map((w) => w.close()))
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)

console.log(`${workers.length} workers running`)
