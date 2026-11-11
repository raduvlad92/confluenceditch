import { verifyToken } from "@clerk/backend"

export interface SecurityEnv { APP_ORIGIN: string; CLERK_ISSUER: string; CLERK_JWT_KEY: string; CREDENTIAL_KEY: string }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
export async function authenticate(request: Request, env: SecurityEnv): Promise<string> {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1]
  if (!token || token.length > 16_000) throw new HttpError(401, "Sign in to continue.")
  try {
    const claims = await verifyToken(token, { jwtKey: env.CLERK_JWT_KEY, authorizedParties: [env.APP_ORIGIN] })
    if (claims.iss !== env.CLERK_ISSUER || claims.azp !== env.APP_ORIGIN || !claims.sub || !claims.sid || claims.sts === "pending") throw new Error("Invalid session")
    return claims.sub
  } catch { throw new HttpError(401, "Your sign-in expired. Sign in again to continue.") }
}
export function checkOrigin(request: Request, origin: string) {
  if (new URL(request.url).origin !== origin || (request.headers.has("origin") && request.headers.get("origin") !== origin)) throw new HttpError(403, "This request must come from the application.")
}
function bytes(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)) }
function base64(value: Uint8Array) { return btoa(String.fromCharCode(...value)) }
async function key(value: string) { return crypto.subtle.importKey("raw", bytes(value), "AES-GCM", false, ["encrypt", "decrypt"]) }
export async function encrypt(value: unknown, secret: string, binding: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(binding) }, await key(secret), new TextEncoder().encode(JSON.stringify(value)))
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`
}
export async function decrypt<T>(value: string, secret: string, binding: string): Promise<T> {
  const [iv, payload] = value.split(".")
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: new TextEncoder().encode(binding) }, await key(secret), bytes(payload))
  return JSON.parse(new TextDecoder().decode(clear)) as T
}
export async function body(request: Request, max = 12_000): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > max) throw new HttpError(413, "Request is too large.")
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, "Request body is required.")
  const chunks: Uint8Array[] = []; let length = 0
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length; if (length > max) { await reader.cancel(); throw new HttpError(413, "Request is too large.") }; chunks.push(next.value) }
  } finally { reader.releaseLock() }
  const output = new Uint8Array(length); let offset = 0
  for (const part of chunks) { output.set(part, offset); offset += part.length }
  return JSON.parse(new TextDecoder().decode(output))
}
