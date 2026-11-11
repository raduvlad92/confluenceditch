const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
    throw new Error(err.error?.message ?? "Request failed")
  }

  return res.json()
}

export const api = {
  // Connections
  getConfluenceConnections: () =>
    apiFetch<{ data: unknown[] }>("/connections/confluence"),
  startConfluenceOAuth: () =>
    apiFetch<{ data: { url: string } }>("/connections/confluence/oauth/start", { method: "POST" }),
  deleteConfluenceConnection: (id: string) =>
    apiFetch(`/connections/confluence/${id}`, { method: "DELETE" }),
  getConfluenceSpaces: (id: string) =>
    apiFetch<{ data: Array<{ key: string; name: string; type: string }> }>(`/connections/confluence/${id}/spaces`),

  getNotionConnections: () =>
    apiFetch<{ data: unknown[] }>("/connections/notion"),
  startNotionOAuth: () =>
    apiFetch<{ data: { url: string } }>("/connections/notion/oauth/start", { method: "POST" }),
  deleteNotionConnection: (id: string) =>
    apiFetch(`/connections/notion/${id}`, { method: "DELETE" }),
  getNotionPages: (id: string) =>
    apiFetch<{ data: Array<{ id: string; title: string; type: string }> }>(`/connections/notion/${id}/pages`),

  // Migrations
  getMigrations: (page = 1) =>
    apiFetch<{ data: unknown[]; meta: { total: number } }>(`/migrations?page=${page}`),
  createMigration: (body: unknown) =>
    apiFetch<{ data: unknown }>("/migrations", { method: "POST", body: JSON.stringify(body) }),
  getMigration: (id: string) =>
    apiFetch<{ data: unknown }>(`/migrations/${id}`),
  startMigration: (id: string) =>
    apiFetch<{ data: unknown }>(`/migrations/${id}/start`, { method: "POST" }),
  pauseMigration: (id: string) =>
    apiFetch(`/migrations/${id}/pause`, { method: "POST" }),
  cancelMigration: (id: string) =>
    apiFetch(`/migrations/${id}/cancel`, { method: "POST" }),
  retryMigration: (id: string) =>
    apiFetch(`/migrations/${id}/retry`, { method: "POST" }),
  getMigrationProgress: (id: string) =>
    apiFetch<{ data: unknown }>(`/migrations/${id}/progress`),
  getMigrationPages: (id: string, page = 1, status?: string) =>
    apiFetch<{ data: unknown[]; meta: { total: number } }>(
      `/migrations/${id}/pages?page=${page}${status ? `&status=${status}` : ""}`
    ),
  getMigrationLogs: (id: string, cursor?: string, level?: string) =>
    apiFetch<{ data: unknown[] }>(
      `/migrations/${id}/logs?${cursor ? `cursor=${cursor}&` : ""}${level ? `level=${level}` : ""}`
    ),

  // Admin
  getAdminStats: () => apiFetch<{ data: unknown }>("/admin/stats"),
  getAdminUsers: (page = 1, q?: string) =>
    apiFetch<{ data: unknown[]; meta: { total: number } }>(
      `/admin/users?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`
    ),
  getAdminMigrations: (page = 1, status?: string) =>
    apiFetch<{ data: unknown[]; meta: { total: number } }>(
      `/admin/migrations?page=${page}${status ? `&status=${status}` : ""}`
    ),
}
