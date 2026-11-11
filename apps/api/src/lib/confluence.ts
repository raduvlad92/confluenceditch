import { decrypt, encrypt } from "./crypto"
import { prisma } from "./prisma"

const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token"
const ATLASSIAN_API_BASE = "https://api.atlassian.com"

export function getConfluenceApiBase(cloudId: string): string {
  return `${ATLASSIAN_API_BASE}/ex/confluence/${cloudId}/wiki/rest/api`
}

export async function refreshConfluenceToken(connectionId: string): Promise<string> {
  const conn = await prisma.confluenceConnection.findUniqueOrThrow({
    where: { id: connectionId },
  })

  const refreshToken = decrypt(conn.refreshToken)

  const res = await fetch(ATLASSIAN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    await prisma.confluenceConnection.update({
      where: { id: connectionId },
      data: { status: "expired" },
    })
    throw new Error(`Failed to refresh Confluence token: ${res.status}`)
  }

  const json = await res.json()
  const expiresAt = new Date(Date.now() + json.expires_in * 1000)

  await prisma.confluenceConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: encrypt(json.access_token),
      refreshToken: encrypt(json.refresh_token),
      tokenExpiresAt: expiresAt,
      status: "active",
    },
  })

  return json.access_token
}

export async function getConfluenceToken(connectionId: string): Promise<string> {
  const conn = await prisma.confluenceConnection.findUniqueOrThrow({
    where: { id: connectionId },
  })

  // Refresh if expires within 5 minutes
  const needsRefresh =
    !conn.tokenExpiresAt || conn.tokenExpiresAt < new Date(Date.now() + 5 * 60 * 1000)

  if (needsRefresh) {
    return refreshConfluenceToken(connectionId)
  }

  return decrypt(conn.accessToken)
}

export async function confluenceFetch(
  connectionId: string,
  cloudId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getConfluenceToken(connectionId)
  const base = getConfluenceApiBase(cloudId)

  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  })
}

export async function getConfluenceSpaces(
  connectionId: string,
  cloudId: string
): Promise<Array<{ key: string; name: string; type: string }>> {
  const spaces: Array<{ key: string; name: string; type: string }> = []
  let start = 0
  const limit = 50

  while (true) {
    const res = await confluenceFetch(
      connectionId,
      cloudId,
      `/space?start=${start}&limit=${limit}&type=global`
    )
    if (!res.ok) throw new Error(`Failed to fetch spaces: ${res.status}`)

    const json = await res.json()
    spaces.push(
      ...json.results.map((s: { key: string; name: string; type: string }) => ({
        key: s.key,
        name: s.name,
        type: s.type,
      }))
    )

    if (json.results.length < limit) break
    start += limit
  }

  return spaces
}
