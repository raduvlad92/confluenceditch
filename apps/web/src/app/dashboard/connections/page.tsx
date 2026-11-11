"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { ConfluenceConnection, NotionConnection } from "@confluenceditch/types"

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "bg-green-400" : "bg-red-400"
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

export default function ConnectionsPage() {
  const [confluenceConns, setConfluenceConns] = useState<ConfluenceConnection[]>([])
  const [notionConns, setNotionConns] = useState<NotionConnection[]>([])

  useEffect(() => {
    Promise.all([api.getConfluenceConnections(), api.getNotionConnections()]).then(
      ([cf, no]) => {
        setConfluenceConns(cf.data as ConfluenceConnection[])
        setNotionConns(no.data as NotionConnection[])
      }
    )
  }, [])

  async function connectConfluence() {
    const res = await api.startConfluenceOAuth()
    window.location.href = res.data.url
  }

  async function connectNotion() {
    const res = await api.startNotionOAuth()
    window.location.href = res.data.url
  }

  async function disconnectConfluence(id: string) {
    await api.deleteConfluenceConnection(id)
    setConfluenceConns((prev) => prev.filter((c) => c.id !== id))
  }

  async function disconnectNotion(id: string) {
    await api.deleteNotionConnection(id)
    setNotionConns((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Connections</h1>
      <p className="text-gray-500 mb-8">Connect your Confluence and Notion workspaces.</p>

      {/* Confluence */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Confluence</h2>
            <p className="text-sm text-gray-500">Your Confluence Cloud workspaces</p>
          </div>
          <button
            onClick={connectConfluence}
            className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
          >
            Connect Confluence
          </button>
        </div>

        {confluenceConns.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-center text-sm text-gray-400">
            No Confluence workspaces connected
          </div>
        ) : (
          <div className="space-y-2">
            {confluenceConns.map((conn) => (
              <div key={conn.id} className="bg-white border rounded-xl px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot status={conn.status} />
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{conn.siteName ?? conn.siteUrl}</p>
                    <p className="text-xs text-gray-400">{conn.siteUrl}</p>
                  </div>
                </div>
                <button
                  onClick={() => disconnectConfluence(conn.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notion */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Notion</h2>
            <p className="text-sm text-gray-500">Your Notion workspaces</p>
          </div>
          <button
            onClick={connectNotion}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
          >
            Connect Notion
          </button>
        </div>

        {notionConns.length === 0 ? (
          <div className="bg-white border rounded-xl p-6 text-center text-sm text-gray-400">
            No Notion workspaces connected
          </div>
        ) : (
          <div className="space-y-2">
            {notionConns.map((conn) => (
              <div key={conn.id} className="bg-white border rounded-xl px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot status={conn.status} />
                  <div className="flex items-center gap-2">
                    {conn.workspaceIcon && (
                      <span className="text-lg">{conn.workspaceIcon}</span>
                    )}
                    <p className="font-medium text-gray-900 text-sm">{conn.workspaceName ?? "Notion Workspace"}</p>
                  </div>
                </div>
                <button
                  onClick={() => disconnectNotion(conn.id)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
