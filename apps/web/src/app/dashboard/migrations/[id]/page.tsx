"use client"

import { useEffect, useState, useCallback, use } from "react"
import { api } from "@/lib/api"
import type { Migration, PageMapping, MigrationLog } from "@confluenceditch/types"

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  converting: "bg-blue-50 text-blue-600",
  pushing: "bg-purple-50 text-purple-600",
  done: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-600",
  skipped: "bg-gray-50 text-gray-400",
}

const LOG_COLORS: Record<string, string> = {
  info: "text-gray-600",
  warn: "text-yellow-600",
  error: "text-red-600",
}

export default function MigrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [migration, setMigration] = useState<Migration | null>(null)
  const [pages, setPages] = useState<PageMapping[]>([])
  const [logs, setLogs] = useState<MigrationLog[]>([])
  const [tab, setTab] = useState<"pages" | "logs">("pages")
  const [pageFilter, setPageFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const fetchProgress = useCallback(async () => {
    const res = await api.getMigrationProgress(id)
    setMigration((prev) => prev ? { ...prev, ...(res.data as Partial<Migration>) } : null)
  }, [id])

  useEffect(() => {
    Promise.all([
      api.getMigration(id),
      api.getMigrationPages(id),
      api.getMigrationLogs(id),
    ]).then(([m, p, l]) => {
      setMigration(m.data as Migration)
      setPages(p.data as PageMapping[])
      setLogs(l.data as MigrationLog[])
      setLoading(false)
    })
  }, [id])

  // Poll progress while running
  useEffect(() => {
    if (!migration || !["running"].includes(migration.status)) return
    const interval = setInterval(fetchProgress, 3000)
    return () => clearInterval(interval)
  }, [migration?.status, fetchProgress])

  async function handleAction(action: "pause" | "cancel" | "retry") {
    setActing(true)
    try {
      if (action === "pause") await api.pauseMigration(id)
      if (action === "cancel") await api.cancelMigration(id)
      if (action === "retry") await api.retryMigration(id)
      const res = await api.getMigration(id)
      setMigration(res.data as Migration)
    } finally {
      setActing(false)
    }
  }

  if (loading || !migration) {
    return <div className="p-8 text-gray-400">Loading...</div>
  }

  const pct = migration.pagesTotal > 0
    ? Math.round((migration.pagesDone / migration.pagesTotal) * 100)
    : 0

  const filteredPages = pageFilter
    ? pages.filter((p) => p.status === pageFilter)
    : pages

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{migration.label}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              migration.status === "completed" ? "bg-green-100 text-green-700" :
              migration.status === "running" ? "bg-blue-100 text-blue-700" :
              migration.status === "failed" ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-600"
            }`}>
              {migration.status.replace(/_/g, " ")}
            </span>
            <span className="text-sm text-gray-400">
              {migration.startedAt ? `Started ${new Date(migration.startedAt).toLocaleString()}` : "Not started"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {migration.status === "running" && (
            <button
              onClick={() => handleAction("pause")}
              disabled={acting}
              className="text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Pause
            </button>
          )}
          {["running", "paused"].includes(migration.status) && (
            <button
              onClick={() => handleAction("cancel")}
              disabled={acting}
              className="text-sm border border-red-300 text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {(migration.pagesFailed > 0 || migration.status === "completed_with_errors") && (
            <button
              onClick={() => handleAction("retry")}
              disabled={acting}
              className="text-sm bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50"
            >
              Retry failed
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Migration progress</span>
          <span className="text-sm text-gray-500">{pct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-brand-500 h-2 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{migration.pagesDone}</p>
            <p className="text-xs text-gray-400 mt-0.5">Completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{migration.pagesTotal - migration.pagesDone - migration.pagesFailed}</p>
            <p className="text-xs text-gray-400 mt-0.5">In progress</p>
          </div>
          <div>
            <p className={`text-2xl font-bold ${migration.pagesFailed > 0 ? "text-red-500" : "text-gray-900"}`}>{migration.pagesFailed}</p>
            <p className="text-xs text-gray-400 mt-0.5">Failed</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {(["pages", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Pages tab */}
      {tab === "pages" && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <select
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5"
            >
              <option value="">All pages</option>
              <option value="done">Done</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="pushing">Pushing</option>
            </select>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Page</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Space</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Notion</th>
                </tr>
              </thead>
              <tbody>
                {filteredPages.slice(0, 100).map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-900">{p.confluenceTitle ?? p.confluencePageId}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? ""}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{p.confluenceSpaceKey}</td>
                    <td className="px-4 py-2.5">
                      {p.notionPageId ? (
                        <a
                          href={`https://notion.so/${p.notionPageId.replace(/-/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-600 hover:underline"
                        >
                          Open
                        </a>
                      ) : p.errorMessage ? (
                        <span className="text-xs text-red-500 truncate max-w-[200px] block" title={p.errorMessage}>
                          {p.errorMessage.slice(0, 60)}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logs tab */}
      {tab === "logs" && (
        <div className="bg-gray-900 rounded-xl p-4 font-mono text-xs space-y-1 max-h-96 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs yet.</p>
          ) : (
            [...logs].reverse().map((log) => (
              <div key={log.id} className="flex gap-3">
                <span className="text-gray-500 shrink-0">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span className={`uppercase text-xs font-bold shrink-0 w-10 ${
                  log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-yellow-400" : "text-green-400"
                }`}>
                  {log.level}
                </span>
                <span className={LOG_COLORS[log.level] ?? "text-gray-300"}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
