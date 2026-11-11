"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface AdminMigration {
  id: string
  label: string
  status: string
  pagesTotal: number
  pagesDone: number
  pagesFailed: number
  createdAt: string
  user: { email: string; name: string | null }
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  completed_with_errors: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
}

export default function AdminMigrationsPage() {
  const [migrations, setMigrations] = useState<AdminMigration[]>([])
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getAdminMigrations(1, statusFilter || undefined).then((res) => {
      setMigrations(res.data as AdminMigration[])
      setTotal(res.meta.total)
      setLoading(false)
    })
  }, [statusFilter])

  async function cancelMigration(id: string) {
    await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/v1/admin/migrations/${id}/cancel`,
      { method: "POST", credentials: "include" }
    )
    setMigrations((prev) => prev.map((m) => m.id === id ? { ...m, status: "cancelled" } : m))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Migrations</h1>
          <p className="text-gray-500 mt-1">{total} total</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Migration</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">User</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Progress</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {migrations.map((m) => {
                const pct = m.pagesTotal > 0 ? Math.round((m.pagesDone / m.pagesTotal) * 100) : 0
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{m.label}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{m.user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? ""}`}>
                        {m.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-gray-500 text-xs">{m.pagesDone}/{m.pagesTotal}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{new Date(m.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      {["running", "paused"].includes(m.status) && (
                        <button
                          onClick={() => cancelMigration(m.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Cancel
                        </button>
                      )}
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
