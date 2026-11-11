"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "@/lib/api"

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  provider: string
  createdAt: string
  _count: { migrations: number }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = search.trim()
    setLoading(true)
    api.getAdminUsers(1, q || undefined).then((res) => {
      setUsers(res.data as AdminUser[])
      setTotal(res.meta.total)
      setLoading(false)
    })
  }, [search])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-500 mt-1">{total} registered users</p>
        </div>
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-60"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">User</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Provider</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Migrations</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link href={`/admin/users/${user.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                      {user.email}
                    </Link>
                    {user.name && <p className="text-xs text-gray-400">{user.name}</p>}
                  </td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{user.provider}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.role === "owner" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{user._count.migrations}</td>
                  <td className="px-5 py-3 text-gray-400">{new Date(user.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
