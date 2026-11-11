"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { Migration } from "@confluenceditch/types"

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  completed_with_errors: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
}

export default function DashboardPage() {
  const [migrations, setMigrations] = useState<Migration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMigrations().then((res) => {
      setMigrations((res.data as Migration[]).slice(0, 5))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 mt-1">Manage your Confluence to Notion migrations</p>
      </div>

      {/* CTA */}
      <div className="bg-brand-600 rounded-xl p-6 mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">Ready to migrate?</h2>
          <p className="text-brand-100 text-sm mt-1">Connect your accounts and start your first migration in minutes.</p>
        </div>
        <Link
          href="/dashboard/migrations/new"
          className="bg-white text-brand-700 font-medium px-5 py-2.5 rounded-lg hover:bg-brand-50 transition-colors shrink-0"
        >
          New migration
        </Link>
      </div>

      {/* Recent migrations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recent migrations</h2>
          <Link href="/dashboard/migrations" className="text-sm text-brand-600 hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : migrations.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <p className="text-gray-400 mb-4">No migrations yet</p>
            <Link
              href="/dashboard/migrations/new"
              className="text-brand-600 text-sm font-medium hover:underline"
            >
              Create your first migration
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Label</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Progress</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-500">Started</th>
                </tr>
              </thead>
              <tbody>
                {migrations.map((m) => {
                  const pct = m.pagesTotal > 0 ? Math.round((m.pagesDone / m.pagesTotal) * 100) : 0
                  return (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <Link href={`/dashboard/migrations/${m.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                          {m.label}
                        </Link>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {m.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-gray-500 text-xs">{m.pagesDone}/{m.pagesTotal}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-400">
                        {m.startedAt ? new Date(m.startedAt).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
