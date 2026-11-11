import type { DocumentIdentity } from "./contract"

export const utf8 = new TextEncoder()
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export function sourceKey(value: DocumentIdentity): string {
  return `confluence:${encodeURIComponent(value.namespaceId)}:${value.objectType}:${encodeURIComponent(value.id)}`
}

export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort)
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => compare(a, b)).map(([key, child]) => [key, sort(child)]))
    }
    return item
  }
  return `${JSON.stringify(sort(value), null, 2)}\n`
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

export async function pathId(id: string): Promise<string> {
  // Bounded, case-safe, unrelated to document titles, names or hierarchy.
  return `id-${await sha256(utf8.encode(id))}`
}

export function safeFilename(filename: string): string {
  return `file-${filename.normalize("NFKC").toLowerCase().replace(/[^a-z0-9._-]/g, "-").replace(/[.]+$/g, "").slice(0, 80) || "attachment"}`
}

export function relativePath(from: string, to: string): string {
  const left = from.split("/").slice(0, -1)
  const right = to.split("/")
  while (left.length && right.length && left[0] === right[0]) { left.shift(); right.shift() }
  return [...left.map(() => ".."), ...right].join("/")
}

export function escapeMarkdown(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/[`*_[\]<>|]/g, "\\$&").replace(/(^|\n)(\s*)([#>+\-=!]|\d+\.)/g, "$1$2\\$3")
}

export function fence(text: string, language = ""): string {
  const runs = text.match(/`+/g) ?? []
  const delimiter = "`".repeat(Math.max(3, ...runs.map(run => run.length + 1)))
  return `${delimiter}${language.replace(/[^a-zA-Z0-9_+-]/g, "")}\n${text}${text.endsWith("\n") ? "" : "\n"}${delimiter}`
}

export function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid canonical base64 asset")
  }
  const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  if (btoa(binary) !== value) throw new Error("Non-canonical base64 asset")
  return bytes
}
