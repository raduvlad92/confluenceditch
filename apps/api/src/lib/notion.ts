import { decrypt } from "./crypto"
import { prisma } from "./prisma"

const NOTION_API_BASE = "https://api.notion.com/v1"
const NOTION_VERSION = "2022-06-28"

export async function getNotionToken(connectionId: string): Promise<string> {
  const conn = await prisma.notionConnection.findUniqueOrThrow({
    where: { id: connectionId },
  })
  return decrypt(conn.accessToken)
}

export async function notionFetch(
  connectionId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getNotionToken(connectionId)

  return fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...options.headers,
    },
  })
}

export async function getNotionTopLevelPages(
  connectionId: string
): Promise<Array<{ id: string; title: string; type: string }>> {
  const res = await notionFetch(connectionId, "/search", {
    method: "POST",
    body: JSON.stringify({
      filter: { value: "page", property: "object" },
      sort: { direction: "descending", timestamp: "last_edited_time" },
      page_size: 100,
    }),
  })

  if (!res.ok) throw new Error(`Failed to search Notion pages: ${res.status}`)

  const json = await res.json()

  return json.results.map((p: { id: string; properties?: { title?: { title?: Array<{ plain_text: string }> } }; title?: Array<{ plain_text: string }> }) => {
    const title =
      p.properties?.title?.title?.[0]?.plain_text ??
      p.title?.[0]?.plain_text ??
      "Untitled"
    return { id: p.id.replace(/-/g, ""), title, type: "page" }
  })
}

// Creates a Notion page and returns its ID
export async function createNotionPage(
  connectionId: string,
  parentId: string,
  title: string,
  children: unknown[]
): Promise<string> {
  const CHUNK_SIZE = 100

  // Create the page with the first chunk of children
  const firstChunk = children.slice(0, CHUNK_SIZE)

  const res = await notionFetch(connectionId, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentId },
      properties: {
        title: { title: [{ type: "text", text: { content: title } }] },
      },
      children: firstChunk,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Notion page creation failed: ${JSON.stringify(err)}`)
  }

  const page = await res.json()
  const pageId = page.id

  // Append remaining chunks if needed
  for (let i = CHUNK_SIZE; i < children.length; i += CHUNK_SIZE) {
    const chunk = children.slice(i, i + CHUNK_SIZE)
    const appendRes = await notionFetch(connectionId, `/blocks/${pageId}/children`, {
      method: "PATCH",
      body: JSON.stringify({ children: chunk }),
    })
    if (!appendRes.ok) {
      const err = await appendRes.json()
      throw new Error(`Notion block append failed: ${JSON.stringify(err)}`)
    }
  }

  return pageId
}
