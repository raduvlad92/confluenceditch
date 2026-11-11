let hosted = false
let getToken: (() => Promise<string | null>) | undefined
export function configureTransport(value: boolean, token?: () => Promise<string | null>) { hosted = value; getToken = token }
export function isHosted() { return hosted }
export function apiUrl(path: string) { return `${hosted ? "/api/takeout" : "/api/local"}/${path}` }
export async function authorizedFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  if (hosted) {
    const token = await getToken?.()
    if (!token) throw new Error("Sign in again to continue.")
    headers.set("Authorization", `Bearer ${token}`)
  }
  const response = await fetch(url, { ...options, cache: "no-store", credentials: "same-origin", headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? "The request failed. Please try again.")
  }
  return response
}
export async function localRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(apiUrl(path), { ...options, headers: { "Content-Type": "application/json", "X-ConfluenceDitch-Client": "local-ui", ...options.headers } })
  return response.json() as Promise<T>
}
export async function downloadFile(url: string, filename: string) {
  const response = await authorizedFetch(url)
  const object = URL.createObjectURL(await response.blob())
  const link = document.createElement("a")
  link.href = object; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(object), 60_000)
}
