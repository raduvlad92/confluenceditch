"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import type { ConfluenceConnection, NotionConnection } from "@confluenceditch/types"
import { useEffect } from "react"

type Step = 1 | 2 | 3

export default function NewMigrationPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1 data
  const [confluenceConns, setConfluenceConns] = useState<ConfluenceConnection[]>([])
  const [selectedConfluenceId, setSelectedConfluenceId] = useState("")
  const [spaces, setSpaces] = useState<Array<{ key: string; name: string }>>([])
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([])
  const [loadingSpaces, setLoadingSpaces] = useState(false)

  // Step 2 data
  const [notionConns, setNotionConns] = useState<NotionConnection[]>([])
  const [selectedNotionId, setSelectedNotionId] = useState("")
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string }>>([])
  const [selectedNotionParent, setSelectedNotionParent] = useState("")
  const [loadingPages, setLoadingPages] = useState(false)

  // Step 3 data
  const [label, setLabel] = useState("")
  const [includeAttachments, setIncludeAttachments] = useState(true)
  const [dryRun, setDryRun] = useState(false)

  useEffect(() => {
    Promise.all([api.getConfluenceConnections(), api.getNotionConnections()]).then(
      ([cf, no]) => {
        const cfConns = cf.data as ConfluenceConnection[]
        const noConns = no.data as NotionConnection[]
        setConfluenceConns(cfConns)
        setNotionConns(noConns)
        if (cfConns.length === 1) setSelectedConfluenceId(cfConns[0].id)
        if (noConns.length === 1) setSelectedNotionId(noConns[0].id)
      }
    )
  }, [])

  async function handleConfluenceSelect(id: string) {
    setSelectedConfluenceId(id)
    setSelectedSpaces([])
    setSpaces([])
    if (!id) return
    setLoadingSpaces(true)
    try {
      const res = await api.getConfluenceSpaces(id)
      setSpaces(res.data)
    } finally {
      setLoadingSpaces(false)
    }
  }

  async function handleNotionSelect(id: string) {
    setSelectedNotionId(id)
    setSelectedNotionParent("")
    setNotionPages([])
    if (!id) return
    setLoadingPages(true)
    try {
      const res = await api.getNotionPages(id)
      setNotionPages(res.data)
    } finally {
      setLoadingPages(false)
    }
  }

  function toggleSpace(key: string) {
    setSelectedSpaces((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const migration = await api.createMigration({
        confluenceConnectionId: selectedConfluenceId,
        notionConnectionId: selectedNotionId,
        label: label || `Migration ${new Date().toLocaleDateString()}`,
        spaceKeys: selectedSpaces,
        notionParentId: selectedNotionParent,
        options: { includeAttachments, includePermissions: false, dryRun },
      })
      const m = migration.data as { id: string }
      // Auto-start the migration
      await api.startMigration(m.id)
      router.push(`/dashboard/migrations/${m.id}`)
    } catch (err) {
      setError(String(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">New migration</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s ? "bg-brand-600 text-white" : step > s ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
            }`}>
              {step > s ? "✓" : s}
            </div>
            <span className={`text-sm ${step === s ? "text-gray-900 font-medium" : "text-gray-400"}`}>
              {s === 1 ? "Source" : s === 2 ? "Destination" : "Options"}
            </span>
            {s < 3 && <div className="w-8 h-px bg-gray-200 mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Source */}
      {step === 1 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Select Confluence workspace & spaces</h2>

          <label className="block text-sm font-medium text-gray-700 mb-2">Confluence workspace</label>
          <select
            value={selectedConfluenceId}
            onChange={(e) => handleConfluenceSelect(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5 text-sm mb-5"
          >
            <option value="">Select a workspace...</option>
            {confluenceConns.map((c) => (
              <option key={c.id} value={c.id}>{c.siteName ?? c.siteUrl}</option>
            ))}
          </select>

          {loadingSpaces && <p className="text-sm text-gray-400">Loading spaces...</p>}

          {spaces.length > 0 && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Spaces to migrate <span className="text-gray-400 font-normal">({selectedSpaces.length} selected)</span>
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-2">
                {spaces.map((space) => (
                  <label key={space.key} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSpaces.includes(space.key)}
                      onChange={() => toggleSpace(space.key)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">{space.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{space.key}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!selectedConfluenceId || selectedSpaces.length === 0}
            className="mt-6 w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next: Choose destination
          </button>
        </div>
      )}

      {/* Step 2: Destination */}
      {step === 2 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Select Notion workspace & parent page</h2>

          <label className="block text-sm font-medium text-gray-700 mb-2">Notion workspace</label>
          <select
            value={selectedNotionId}
            onChange={(e) => handleNotionSelect(e.target.value)}
            className="w-full border rounded-lg px-3 py-2.5 text-sm mb-5"
          >
            <option value="">Select a workspace...</option>
            {notionConns.map((c) => (
              <option key={c.id} value={c.id}>{c.workspaceName ?? "Notion Workspace"}</option>
            ))}
          </select>

          {loadingPages && <p className="text-sm text-gray-400">Loading pages...</p>}

          {notionPages.length > 0 && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">Parent page (migration root)</label>
              <select
                value={selectedNotionParent}
                onChange={(e) => setSelectedNotionParent(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="">Select a page...</option>
                {notionPages.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </>
          )}

          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep(1)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedNotionId || !selectedNotionParent}
              className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next: Review options
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Options + Review */}
      {step === 3 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Review & options</h2>

          <div className="bg-gray-50 rounded-lg p-4 mb-5 text-sm space-y-2">
            <div className="flex justify-between text-gray-600">
              <span className="font-medium">Spaces:</span>
              <span>{selectedSpaces.join(", ")}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span className="font-medium">Destination:</span>
              <span>{notionPages.find((p) => p.id === selectedNotionParent)?.title ?? selectedNotionParent}</span>
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">Migration label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Migration ${new Date().toLocaleDateString()}`}
            className="w-full border rounded-lg px-3 py-2.5 text-sm mb-5"
          />

          <div className="space-y-3 mb-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeAttachments} onChange={(e) => setIncludeAttachments(e.target.checked)} className="rounded" />
              <div>
                <p className="text-sm font-medium text-gray-700">Include attachments</p>
                <p className="text-xs text-gray-400">Download and embed images and files</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded" />
              <div>
                <p className="text-sm font-medium text-gray-700">Dry run</p>
                <p className="text-xs text-gray-400">Simulate migration without writing to Notion</p>
              </div>
            </label>
          </div>

          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50">
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? "Starting..." : dryRun ? "Start dry run" : "Start migration"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
