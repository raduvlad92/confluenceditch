"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface Stats {
  totalUsers: number
  totalMigrations: number
  totalPagesMigrated: number
  activeMigrations: number
  failureRate: number
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border p-6">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.getAdminStats().then((res) => setStats(res.data as Stats))
  }, [])

  if (!stats) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Total migrations" value={stats.totalMigrations} />
        <StatCard label="Pages migrated" value={stats.totalPagesMigrated.toLocaleString()} />
        <StatCard label="Active migrations" value={stats.activeMigrations} />
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold text-gray-900 mb-2">System health</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            <span className="text-sm text-gray-600">API</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            <span className="text-sm text-gray-600">Workers</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            <span className="text-sm text-gray-600">Database</span>
          </div>
          <span className="text-xs text-gray-400 ml-auto">
            Failure rate: {(stats.failureRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
