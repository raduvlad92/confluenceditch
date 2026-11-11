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

export default function MigrationsListPage() {
  const [migrations, setMigrations] = useState<Migration[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMigrations().then((res) => {
      setMigrations(res.data as Migration[])
      setTotal(res.meta.total)
      setLoading(false)
    })
  }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Migrations</h1>
          <p className="text-gray-500 mt-1">{total} total migration{total !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/dashboard/migrations/new"
          className="bg-brand-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          New migration
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading...</div>
      ) : migrations.length === 0 ? (
        <div className="bg-white rounded-xl border p-16 text-center">
          <p className="text-gray-400 mb-4 text-lg">No migrations yet</p>
          <Link href="/dashboard/migrations/new" className="text-brand-600 font-medium hover:underline">
            Start your first migration
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
                <th className="text-left px-5 py-3 font-medium text-gray-500">Spaces</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {migrations.map((m) => {
                const pct = m.pagesTotal > 0 ? Math.round((m.pagesDone / m.pagesTotal) * 100) : 0
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/migrations/${m.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                        {m.label}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? ""}`}>
                        {m.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-gray-500 text-xs whitespace-nowrap">{m.pagesDone}/{m.pagesTotal}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-500">{m.spaceKeys.join(", ")}</td>
                    <td className="px-5 py-4 text-gray-400">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/migrations/${m.id}`} className="text-brand-600 hover:underline text-xs">
                        Details
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
