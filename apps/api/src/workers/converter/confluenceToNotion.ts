import * as cheerio from "cheerio"
import type { CheerioAPI } from "cheerio"
import type { Element } from "domhandler"

// ─── Notion block type definitions ───────────────────────────────────────────

interface RichText {
  type: "text"
  text: { content: string; link?: { url: string } | null }
  annotations?: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
    color?: string
  }
}

interface NotionBlock {
  object: "block"
  type: string
  [key: string]: unknown
}

interface Annotations {
  bold: boolean
  italic: boolean
  strikethrough: boolean
  underline: boolean
  code: boolean
}

const DEFAULT_ANNOTATIONS: Annotations = {
  bold: false,
  italic: false,
  strikethrough: false,
  underline: false,
  code: false,
}

// ─── Rich text extraction ─────────────────────────────────────────────────────

function extractRichText(
  $: CheerioAPI,
  el: Element,
  annotations: Annotations = DEFAULT_ANNOTATIONS
): RichText[] {
  const result: RichText[] = []

  for (const child of el.children ?? []) {
    if (child.type === "text") {
      const content = (child as { data: string }).data
      if (content) {
        result.push(makeRichText(content, annotations))
      }
      continue
    }

    if (child.type !== "tag") continue

    const tag = (child as Element).tagName?.toLowerCase()
    const childAnnotations = { ...annotations }

    switch (tag) {
      case "strong":
      case "b":
        result.push(...extractRichText($, child as Element, { ...childAnnotations, bold: true }))
        break
      case "em":
      case "i":
        result.push(...extractRichText($, child as Element, { ...childAnnotations, italic: true }))
        break
      case "s":
      case "del":
        result.push(...extractRichText($, child as Element, { ...childAnnotations, strikethrough: true }))
        break
      case "u":
        result.push(...extractRichText($, child as Element, { ...childAnnotations, underline: true }))
        break
      case "code":
        result.push(...extractRichText($, child as Element, { ...childAnnotations, code: true }))
        break
      case "a": {
        const href = $(child as Element).attr("href") ?? ""
        const text = $(child as Element).text()
        if (text) {
          result.push({
            type: "text",
            text: { content: text, link: href ? { url: href } : null },
            annotations: childAnnotations,
          })
        }
        break
      }
      case "br":
        result.push(makeRichText("\n", annotations))
        break
      case "span": {
        const style = $(child as Element).attr("style") ?? ""
        const spanAnnotations = { ...childAnnotations }
        if (style.includes("font-weight: bold") || style.includes("font-weight:bold")) {
          spanAnnotations.bold = true
        }
        if (style.includes("font-style: italic") || style.includes("font-style:italic")) {
          spanAnnotations.italic = true
        }
        result.push(...extractRichText($, child as Element, spanAnnotations))
        break
      }
      default:
        result.push(...extractRichText($, child as Element, childAnnotations))
    }
  }

  return result
}

function makeRichText(content: string, annotations: Annotations = DEFAULT_ANNOTATIONS): RichText {
  const rt: RichText = { type: "text", text: { content } }
  const hasAnnotation = Object.values(annotations).some(Boolean)
  if (hasAnnotation) {
    rt.annotations = { ...annotations }
  }
  return rt
}

function chunkRichText(richText: RichText[]): RichText[][] {
  // Notion limits rich_text array to 100 items and 2000 chars per item
  const chunks: RichText[][] = []
  let current: RichText[] = []

  for (const rt of richText) {
    // Split long text items
    const content = rt.text.content
    if (content.length > 1900) {
      const parts = content.match(/.{1,1900}/g) ?? []
      for (const part of parts) {
        current.push({ ...rt, text: { ...rt.text, content: part } })
        if (current.length >= 100) {
          chunks.push(current)
          current = []
        }
      }
    } else {
      current.push(rt)
      if (current.length >= 100) {
        chunks.push(current)
        current = []
      }
    }
  }

  if (current.length > 0) chunks.push(current)
  return chunks.length > 0 ? chunks : [[]]
}

// ─── Block builders ───────────────────────────────────────────────────────────

function paragraphBlock(richText: RichText[]): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText } }
}

function headingBlock(level: 1 | 2 | 3, richText: RichText[]): NotionBlock {
  const type = `heading_${level}` as "heading_1" | "heading_2" | "heading_3"
  return { object: "block", type, [type]: { rich_text: richText } }
}

function bulletedListItemBlock(richText: RichText[], children: NotionBlock[] = []): NotionBlock {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText, children: children.length ? children : undefined },
  }
}

function numberedListItemBlock(richText: RichText[], children: NotionBlock[] = []): NotionBlock {
  return {
    object: "block",
    type: "numbered_list_item",
    numbered_list_item: { rich_text: richText, children: children.length ? children : undefined },
  }
}

function codeBlock(code: string, language: string = "plain text"): NotionBlock {
  // Notion supports specific language identifiers
  const notionLang = mapLanguage(language)
  return {
    object: "block",
    type: "code",
    code: {
      rich_text: [{ type: "text", text: { content: code.slice(0, 2000) } }],
      language: notionLang,
    },
  }
}

function calloutBlock(
  emoji: string,
  richText: RichText[],
  children: NotionBlock[] = []
): NotionBlock {
  return {
    object: "block",
    type: "callout",
    callout: {
      rich_text: richText,
      icon: { type: "emoji", emoji },
      children: children.length ? children : undefined,
    },
  }
}

function toggleBlock(richText: RichText[], children: NotionBlock[] = []): NotionBlock {
  return {
    object: "block",
    type: "toggle",
    toggle: {
      rich_text: richText,
      children: children.length ? children : undefined,
    },
  }
}

function quoteBlock(richText: RichText[]): NotionBlock {
  return { object: "block", type: "quote", quote: { rich_text: richText } }
}

function dividerBlock(): NotionBlock {
  return { object: "block", type: "divider", divider: {} }
}

function imageBlock(url: string, caption?: string): NotionBlock {
  return {
    object: "block",
    type: "image",
    image: {
      type: "external",
      external: { url },
      caption: caption ? [{ type: "text", text: { content: caption } }] : [],
    },
  }
}

function tableBlock(rows: RichText[][][]): NotionBlock {
  const tableWidth = rows[0]?.length ?? 1
  return {
    object: "block",
    type: "table",
    table: {
      table_width: tableWidth,
      has_column_header: true,
      has_row_header: false,
      children: rows.map((row, i) => ({
        object: "block",
        type: "table_row",
        table_row: {
          cells: row.map((cell) => cell),
        },
      })),
    },
  }
}

// ─── Language mapping ─────────────────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  rb: "ruby",
  ruby: "ruby",
  java: "java",
  go: "go",
  golang: "go",
  rs: "rust",
  rust: "rust",
  cs: "c#",
  "c#": "c#",
  cpp: "c++",
  "c++": "c++",
  c: "c",
  php: "php",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  sql: "sql",
  html: "html",
  css: "css",
  xml: "xml",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  bash: "bash",
  shell: "shell",
  sh: "shell",
  powershell: "powershell",
  dockerfile: "dockerfile",
  markdown: "markdown",
  md: "markdown",
}

function mapLanguage(lang: string): string {
  return LANG_MAP[lang.toLowerCase()] ?? "plain text"
}

// ─── Confluence macro handlers ────────────────────────────────────────────────

function handleCodeMacro($: CheerioAPI, el: Element): NotionBlock {
  const langParam = ($(el).find('ac\\:parameter[ac\\:name="language"]').text() ||
    $(el).find('[ac\\:name="language"]').attr("ac:name")) ?? "plain text"
  const body = $(el).find("ac\\:plain-text-body").text() ||
    $(el).find("ac\\:rich-text-body").text() ||
    $(el).text()
  return codeBlock(body.trim(), langParam)
}

function handleInfoMacro($: CheerioAPI, el: Element, macroName: string): NotionBlock {
  const emojiMap: Record<string, string> = {
    info: "ℹ️",
    note: "📝",
    warning: "⚠️",
    tip: "💡",
    success: "✅",
  }
  const emoji = emojiMap[macroName] ?? "ℹ️"
  const titleEl = $(el).find('ac\\:parameter[ac\\:name="title"]')
  const title = titleEl.text()
  const bodyEl = $(el).find("ac\\:rich-text-body")
  const bodyBlocks = bodyEl.length ? convertChildren($, bodyEl[0] as Element) : []

  const richText = title ? [makeRichText(title, { ...DEFAULT_ANNOTATIONS, bold: true })] : [makeRichText("")]
  return calloutBlock(emoji, richText, bodyBlocks)
}

function handleExpandMacro($: CheerioAPI, el: Element): NotionBlock {
  const titleParam = $(el).find('ac\\:parameter[ac\\:name="title"]').text() || "Expand"
  const bodyEl = $(el).find("ac\\:rich-text-body")
  const children = bodyEl.length ? convertChildren($, bodyEl[0] as Element) : []
  return toggleBlock([makeRichText(titleParam)], children)
}

// ─── Element-to-block conversion ─────────────────────────────────────────────

function convertElement($: CheerioAPI, el: Element): NotionBlock[] {
  const tag = el.tagName?.toLowerCase()
  if (!tag) return []

  switch (tag) {
    case "h1":
      return [headingBlock(1, extractRichText($, el))]
    case "h2":
      return [headingBlock(2, extractRichText($, el))]
    case "h3":
      return [headingBlock(3, extractRichText($, el))]
    case "h4":
    case "h5":
    case "h6":
      // Notion only has 3 heading levels
      return [headingBlock(3, extractRichText($, el))]

    case "p": {
      const richText = extractRichText($, el)
      if (richText.length === 0) return []
      const chunks = chunkRichText(richText)
      return chunks.map((chunk) => paragraphBlock(chunk))
    }

    case "ul": {
      const items: NotionBlock[] = []
      $(el).children("li").each((_, li) => {
        const directText = extractRichTextFromListItem($, li as Element)
        const nestedUl = $(li as Element).find("> ul")
        const nestedOl = $(li as Element).find("> ol")
        let children: NotionBlock[] = []
        if (nestedUl.length) children = convertElement($, nestedUl[0] as Element)
        if (nestedOl.length) children = convertElement($, nestedOl[0] as Element)
        items.push(bulletedListItemBlock(directText, children))
      })
      return items
    }

    case "ol": {
      const items: NotionBlock[] = []
      $(el).children("li").each((_, li) => {
        const directText = extractRichTextFromListItem($, li as Element)
        const nestedUl = $(li as Element).find("> ul")
        const nestedOl = $(li as Element).find("> ol")
        let children: NotionBlock[] = []
        if (nestedUl.length) children = convertElement($, nestedUl[0] as Element)
        if (nestedOl.length) children = convertElement($, nestedOl[0] as Element)
        items.push(numberedListItemBlock(directText, children))
      })
      return items
    }

    case "blockquote": {
      const richText = extractRichText($, el)
      return richText.length ? [quoteBlock(richText)] : []
    }

    case "hr":
      return [dividerBlock()]

    case "pre": {
      const code = $(el).find("code")
      const langClass = code.attr("class") ?? ""
      const lang = langClass.replace(/language-/, "").trim()
      return [codeBlock(code.text() || $(el).text(), lang)]
    }

    case "table": {
      const rows: RichText[][][] = []
      $(el).find("tr").each((_, tr) => {
        const row: RichText[][] = []
        $(tr as Element).find("th, td").each((_, cell) => {
          row.push(extractRichText($, cell as Element))
        })
        if (row.length > 0) rows.push(row)
      })
      return rows.length > 0 ? [tableBlock(rows)] : []
    }

    case "img": {
      const src = $(el).attr("src") ?? ""
      const alt = $(el).attr("alt")
      if (!src) return []
      return [imageBlock(src, alt)]
    }

    case "ac:image": {
      // Confluence image macro
      const attachment = $(el).find("ri\\:attachment")
      const url = attachment.attr("ri:filename") ?? ""
      const caption = $(el).find("ac\\:caption").text()
      if (!url) return []
      return [imageBlock(url, caption || undefined)]
    }

    case "ac:structured-macro": {
      const macroName = $(el).attr("ac:name") ?? ""
      switch (macroName) {
        case "code":
          return [handleCodeMacro($, el)]
        case "info":
        case "note":
        case "warning":
        case "tip":
        case "success":
          return [handleInfoMacro($, el, macroName)]
        case "expand":
          return [handleExpandMacro($, el)]
        case "toc":
          return [paragraphBlock([makeRichText("[Table of Contents — not supported in Notion]", { ...DEFAULT_ANNOTATIONS, italic: true })])]
        case "jira": {
          const key = $(el).find('ac\\:parameter[ac\\:name="key"]').text()
          return [paragraphBlock([makeRichText(key ? `Jira: ${key}` : "[Jira link]")])]
        }
        case "panel": {
          const title = $(el).find('ac\\:parameter[ac\\:name="title"]').text()
          const bodyEl = $(el).find("ac\\:rich-text-body")
          const children = bodyEl.length ? convertChildren($, bodyEl[0] as Element) : []
          return [calloutBlock("📌", [makeRichText(title || "Panel")], children)]
        }
        default:
          return [paragraphBlock([makeRichText(`[Unsupported macro: ${macroName}]`, { ...DEFAULT_ANNOTATIONS, italic: true })])]
      }
    }

    case "div":
    case "section":
    case "article":
    case "main":
    case "ac:rich-text-body":
      return convertChildren($, el)

    default:
      // For unknown inline elements, try to extract text
      if (isInlineElement(tag)) return []
      return convertChildren($, el)
  }
}

function isInlineElement(tag: string): boolean {
  const inlineTags = new Set([
    "span", "a", "strong", "b", "em", "i", "u", "s", "del", "code",
    "sub", "sup", "abbr", "cite", "dfn", "kbd", "mark", "q", "samp",
    "small", "time", "var", "br",
  ])
  return inlineTags.has(tag)
}

function extractRichTextFromListItem($: CheerioAPI, li: Element): RichText[] {
  // Extract text from li but exclude nested ul/ol
  const clone = $(li).clone()
  clone.find("ul, ol").remove()
  return extractRichText($, clone[0] as Element)
}

function convertChildren($: CheerioAPI, el: Element): NotionBlock[] {
  const blocks: NotionBlock[] = []
  for (const child of el.children ?? []) {
    if (child.type === "text") {
      const text = (child as { data: string }).data?.trim()
      if (text) {
        blocks.push(paragraphBlock([makeRichText(text)]))
      }
      continue
    }
    if (child.type === "tag") {
      blocks.push(...convertElement($, child as Element))
    }
  }
  return blocks
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function convertConfluenceToNotion(html: string): NotionBlock[] {
  if (!html.trim()) return []

  const $ = cheerio.load(html, { xmlMode: true })
  const root = $("body")[0] ?? $("*").first()[0]

  if (!root) return []

  const blocks = convertChildren($, root as Element)

  // Notion allows max 100 children at the top level per request
  // The push worker handles chunking, so return all blocks here
  return blocks
}
