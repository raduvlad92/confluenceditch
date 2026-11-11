import { parseDocument } from "htmlparser2"
import { isTag, type AnyNode, type Element } from "domhandler"
import type { Finding, LocalReference, SourceAsset, SourceDocument, SourceRevision } from "./contract"
import { escapeMarkdown, fence, relativePath, sourceKey } from "./util"

const blockTags = new Set(["p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "ul", "ol", "blockquote", "table", "hr", "ac:structured-macro", "ac:task-list", "ac:layout", "ac:layout-section", "ac:layout-cell", "ac:rich-text-body"])
const parse = (storage: string) => parseDocument(storage, { xmlMode: false, recognizeCDATA: true, decodeEntities: true })
const children = (node: AnyNode): AnyNode[] => "children" in node ? node.children : []
const text = (node: AnyNode): string => node.type === "text" ? node.data : children(node).map(text).join("")
const elements = (node: AnyNode, name: string): Element[] => children(node).flatMap(child => [
  ...(isTag(child) && child.name === name ? [child] : []), ...elements(child, name),
])
const slug = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").trim().replace(/[\s-]+/g, "-") || "section"

export interface HeadingIndex {
  ids: string[]
  aliases: Map<string, string>
}

export function headingIndex(storage: string, title: string): HeadingIndex {
  const ids: string[] = []
  const aliases = new Map<string, string>()
  const add = (label: string, alias?: string) => {
    const base = slug(label)
    let anchor = base
    for (let suffix = 1; ids.includes(anchor); suffix++) anchor = `${base}-${suffix}`
    ids.push(anchor)
    for (const key of [label, base, anchor, ...(alias ? [alias] : [])]) if (!aliases.has(key)) aliases.set(key, anchor)
  }
  add(title)
  const visit = (node: AnyNode) => {
    if (isTag(node) && /^h[1-6]$/.test(node.name)) add(text(node), node.attribs.id)
    children(node).forEach(visit)
  }
  visit(parse(storage))
  return { ids, aliases }
}

export interface DocumentTarget {
  document: SourceDocument
  path: string
  headings: HeadingIndex
}
export interface AssetTarget { asset: SourceAsset; path: string }

interface ConvertOptions {
  document: SourceDocument
  revision: SourceRevision
  path: string
  originalPath: string
  current: boolean
  headings: HeadingIndex
  documents: Map<string, DocumentTarget>
  assets: AssetTarget[]
  spaceKeys: Map<string, string>
}

export function convertStorage(options: ConvertOptions): {
  markdown: string
  findings: Finding[]
  references: LocalReference[]
  status: "native" | "fallback"
} {
  const { document, revision, path, headings } = options
  const findings: Finding[] = []
  const references: LocalReference[] = []
  const finding = (code: string, message: string, severity: Finding["severity"] = "warning") => {
    findings.push({ code, message, severity, sourceKey: sourceKey(document), revisionId: revision.id, originalPath: options.originalPath })
  }
  const local = (target: string, fragment: string | null = null) => {
    references.push({ from: path, to: target, fragment })
    return `${relativePath(path, target)}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`
  }
  const safeUrl = (raw: string): string | null => {
    try {
      const url = new URL(raw, document.sourceUrl)
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href.replace(/\(/g, "%28").replace(/\)/g, "%29") : null
    } catch { return null }
  }
  const fragmentFor = (target: DocumentTarget, fragment: string) => {
    let decoded = fragment
    try { decoded = decodeURIComponent(fragment) } catch { /* Retain malformed source reference as a finding. */ }
    return target.headings.aliases.get(decoded) ?? target.headings.aliases.get(slug(decoded)) ?? null
  }
  const documentLink = (target: DocumentTarget | undefined, label: string, fragment = "", originalUrl?: string): string => {
    if (!target) {
      finding("unresolved_document", "A document link has no unambiguous captured target; its source reference is retained.")
      const url = originalUrl ? safeUrl(originalUrl) : null
      return url ? `[${label}](${url})` : `${label} (unresolved source reference)`
    }
    const anchor = fragment ? fragmentFor(target, fragment) : null
    if (fragment && !anchor) {
      finding("unresolved_anchor", `The source fragment ${JSON.stringify(fragment)} could not be resolved; the document link omits it.`)
    }
    if (!options.current && target.path !== path) {
      finding("historical_link_targets_current", "A historical document link targets captured current content; no historical whole-site state is inferred.", "info")
    }
    return `[${label}](${local(target.path, anchor)})`
  }
  const assetFor = (filename: string, requestedVersion?: string): AssetTarget | undefined => {
    const bindings = revision.assetBindings.filter(binding => binding.filename === filename)
    if (bindings.length !== 1) return undefined
    const binding = bindings[0]
    if (requestedVersion && binding.revisionId !== requestedVersion) return undefined
    return options.assets.find(target => target.asset.namespaceId === document.namespaceId && target.asset.id === binding.assetId && target.asset.revisionId === binding.revisionId)
  }
  const assetByUrl = (url: string): AssetTarget | undefined => {
    const matches = options.assets.filter(target => target.asset.sourceUrl === url && target.asset.namespaceId === document.namespaceId)
    if (matches.length !== 1) return undefined
    const target = matches[0]
    if (!options.current && !revision.assetBindings.some(binding => binding.assetId === target.asset.id && binding.revisionId === target.asset.revisionId)) return undefined
    return target
  }
  const assetLink = (target: AssetTarget | undefined, label: string, image: boolean): string => {
    if (!target) {
      finding("unresolved_asset_version", "Attachment bytes or an exact revision binding are missing; no latest asset is substituted.")
      return `${label || "Attachment"} (unresolved attachment version)`
    }
    const imageType = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(target.asset.mediaType)
    if (image && !imageType) finding("asset_as_download", "An active or unsupported image format is retained as a file link.")
    return `${image && imageType ? "!" : ""}[${label}](${local(target.path)})`
  }
  const renderChildren = (nodes: AnyNode[]): string => {
    const parts: string[] = []
    let inline = ""
    const flush = () => { if (inline.trim()) parts.push(inline.trim()); inline = "" }
    for (const node of nodes) {
      if (isTag(node) && blockTags.has(node.name)) { flush(); const rendered = render(node).trim(); if (rendered) parts.push(rendered) }
      else inline += render(node)
    }
    flush()
    return parts.join("\n\n")
  }
  let headingCursor = 1
  const render = (node: AnyNode): string => {
    if (node.type === "text") return escapeMarkdown(node.data.replace(/\s+/g, " "))
    if (node.type === "cdata") return escapeMarkdown(text(node))
    if (!isTag(node)) return ""
    const name = node.name
    const inner = () => renderChildren(node.children)
    const inline = () => node.children.map(render).join("")
    if (/^h[1-6]$/.test(name)) return `<a id="${headings.ids[headingCursor++]}"></a>\n\n${"#".repeat(Number(name[1]))} ${inner()}`
    switch (name) {
      case "p": case "div": case "section": case "article": case "ac:rich-text-body": case "ac:layout-cell": return inner()
      case "span": return inline()
      case "strong": case "b": return `**${inline()}**`
      case "em": case "i": return `*${inline()}*`
      case "s": case "del": return `~~${inline()}~~`
      case "br": return "  \n"
      case "hr": return "---"
      case "pre": return fence(text(node), elements(node, "code")[0]?.attribs.class?.replace(/^language-/, "") ?? "")
      case "code": {
        const raw = text(node)
        if (raw.includes("\n")) { finding("multiline_inline_code", "Multiline inline code is represented as a fenced block."); return `\n\n${fence(raw)}\n\n` }
        const delimiter = "`".repeat(Math.max(1, ...(raw.match(/`+/g) ?? []).map(run => run.length + 1)))
        return `${delimiter} ${raw} ${delimiter}`
      }
      case "blockquote": return inner().split("\n").map(line => `> ${line}`).join("\n")
      case "ul": case "ol": {
        const start = /^\d+$/.test(node.attribs.start ?? "") ? Number(node.attribs.start) : 1
        let index = 0
        return node.children.map(item => {
          if (!(isTag(item) && item.name === "li")) {
            const remaining = render(item)
            if (remaining.trim()) finding("list_fallback", "Content outside a list item is preserved in reading order.")
            return remaining.trim()
          }
          const marker = name === "ol" ? `${start + index}. ` : "- "
          index++
          const body = renderChildren(children(item))
          return marker + body.replace(/\n/g, `\n${" ".repeat(marker.length)}`)
        }).filter(Boolean).join("\n")
      }
      case "li": return inner()
      case "input":
        if (node.attribs.type === "checkbox") return `[${"checked" in node.attribs ? "x" : " "}] `
        finding("unsupported_input", "A form control is retained in the original; its value is shown as text.")
        return escapeMarkdown(node.attribs.value ?? "[form control]")
      case "ac:task-list": return elements(node, "ac:task").map(task => {
        const status = elements(task, "ac:task-status")[0]
        const body = elements(task, "ac:task-body")[0]
        return `- [${status && text(status).trim() === "complete" ? "x" : " "}] ${body ? renderChildren(body.children) : "[missing task body]"}`
      }).join("\n")
      case "ac:structured-macro": {
        const macro = node.attribs["ac:name"] ?? "unknown"
        const parameters = elements(node, "ac:parameter").map(parameter => [parameter.attribs["ac:name"] ?? "unnamed", text(parameter)])
        const plain = elements(node, "ac:plain-text-body")[0]
        if (macro === "code" && plain) {
          const extra = parameters.filter(([key]) => key !== "language")
          if (extra.length) finding("code_macro_parameters", "Additional code-macro parameters are retained as JSON alongside the code.")
          return `${extra.length ? `${fence(JSON.stringify(extra), "json")}\n\n` : ""}${fence(text(plain), parameters.find(([key]) => key === "language")?.[1] ?? "")}`
        }
        finding("unsupported_macro", `Macro ${JSON.stringify(macro)} uses a readable fallback; parameters and available bodies are retained.`)
        const body = node.children.filter(child => !(isTag(child) && child.name === "ac:parameter"))
        return `Macro: ${escapeMarkdown(macro)}\n\n${fence(JSON.stringify(parameters), "json")}\n\n${renderChildren(body)}`
      }
      case "ac:plain-text-body": return fence(text(node))
      case "ac:layout":
        finding("layout_fallback", "Layout cells are preserved in reading order; column layout is not reproduced.")
        return inner()
      case "ac:layout-section": return inner()
      case "ac:link": {
        const page = elements(node, "ri:page")[0]
        const attachment = elements(node, "ri:attachment")[0]
        const body = elements(node, "ac:plain-text-link-body")[0] ?? elements(node, "ac:link-body")[0]
        const label = body ? renderChildren(body.children) : escapeMarkdown(page?.attribs["ri:content-title"] ?? attachment?.attribs["ri:filename"] ?? "Source link")
        if (attachment) return assetLink(assetFor(attachment.attribs["ri:filename"] ?? "", attachment.attribs["ri:version-at-save"]), label, false)
        if (!page && node.attribs["ac:anchor"]) {
          return documentLink({ document, path, headings }, label, node.attribs["ac:anchor"])
        }
        if (page) {
          const candidates = [...options.documents.values()].filter(target => target.document.namespaceId === document.namespaceId && (
            page.attribs["ri:content-id"] ? target.document.id === page.attribs["ri:content-id"] :
              target.document.title === page.attribs["ri:content-title"] &&
              (page.attribs["ri:space-key"] ? options.spaceKeys.get(`${document.namespaceId}\0${target.document.spaceId}`) === page.attribs["ri:space-key"] : target.document.spaceId === document.spaceId)
          ))
          return documentLink(candidates.length === 1 ? candidates[0] : undefined, label, node.attribs["ac:anchor"])
        }
        finding("unsupported_source_link", "A source link could not be resolved; its body remains readable.")
        return label
      }
      case "ac:image": {
        const attachment = elements(node, "ri:attachment")[0]
        if (attachment) return assetLink(assetFor(attachment.attribs["ri:filename"] ?? "", attachment.attribs["ri:version-at-save"]), escapeMarkdown(node.attribs["ac:alt"] ?? attachment.attribs["ri:filename"] ?? "Image"), true)
        const external = elements(node, "ri:url")[0]?.attribs["ri:value"]
        finding("external_image", "An external image is preserved as a reference, without fetching or embedding remote content.")
        const url = external ? safeUrl(external) : null
        return url ? `[External image](${url})` : "[Unresolved external image]"
      }
      case "a": {
        const href = node.attribs.href ?? ""
        const label = inline() || escapeMarkdown(href)
        if (href.startsWith("#")) return documentLink({ document, path, headings }, label, href.slice(1))
        const url = safeUrl(href)
        if (!url) { finding("unsafe_url", "An unsafe or malformed link is rendered as text."); return label }
        const parsed = new URL(url)
        const targetUrl = url.split("#")[0]
        const linkedPageId = parsed.pathname.match(/\/wiki\/spaces\/[^/]+\/pages\/(\d+)(?:\/|$)/)?.[1] ?? (parsed.pathname === "/wiki/pages/viewpage.action" ? parsed.searchParams.get("pageId") : null)
        const candidates = [...options.documents.values()].filter(candidate => candidate.document.sourceUrl.split("#")[0] === targetUrl || (linkedPageId !== null && candidate.document.objectType === "page" && candidate.document.id === linkedPageId && new URL(candidate.document.sourceUrl).origin === parsed.origin))
        const target = candidates.length === 1 ? candidates[0] : undefined
        if (target) return documentLink(target, label, parsed.hash.slice(1), url)
        const asset = assetByUrl(url)
        if (asset) return assetLink(asset, label, false)
        const sameSource = [...options.documents.values()].some(candidate => new URL(candidate.document.sourceUrl).origin === parsed.origin)
        if (sameSource) finding("unresolved_source_link", "A source URL remains online because it has no captured local target.")
        return `[${label}](${url})`
      }
      case "img": {
        const src = node.attribs.src ?? ""
        const label = escapeMarkdown(node.attribs.alt ?? "Image")
        const target = assetByUrl(src)
        if (target) return assetLink(target, label, true)
        finding("external_image", "An image without an exact captured revision binding is retained as an online reference only.")
        const url = safeUrl(src)
        return url ? `[${label}](${url})` : label
      }
      case "table": {
        const rows = elements(node, "tr")
        const cells = rows.map(row => row.children.filter(child => isTag(child) && ["td", "th"].includes(child.name)) as Element[])
        const simple = !elements(node, "table").length && cells.length > 0 && cells[0].length > 0 &&
          cells.every(row => row.length === cells[0].length && row.every(cell => !cell.attribs.colspan && !cell.attribs.rowspan && !elements(cell, "pre").length && !elements(cell, "ul").length && !elements(cell, "ol").length))
        if (!simple) {
          finding("table_fallback", "A merged, nested or ragged table uses labeled rows and cells; original structure is preserved in XHTML.")
          return node.children.map(render).join("\n\n")
        }
        const rendered = cells.map(row => `| ${row.map(cell => renderChildren(cell.children).replace(/\n/g, "<br>")).join(" | ")} |`)
        const captions = node.children.filter(child => isTag(child) && child.name === "caption").map(child => renderChildren(children(child)))
        return [...captions, [rendered[0], `| ${cells[0].map(() => "---").join(" | ")} |`, ...rendered.slice(1)].join("\n")].join("\n\n")
      }
      case "thead": case "tbody": case "tfoot": return node.children.map(render).join("\n\n")
      case "tr": return node.children.filter(child => isTag(child)).map((cell, index) => `Cell ${index + 1}: ${render(cell)}`).join("\n\n")
      case "td": case "th": return inner()
      case "script": case "style": case "iframe": case "object": case "embed": case "svg":
        finding("active_content_fallback", `Active ${name} content is inert text; the exact source remains in originals.`)
        return fence(`${name}\n${JSON.stringify(node.attribs)}\n${text(node)}`, "text")
      default:
        finding("unsupported_element", `Element ${JSON.stringify(name)} uses a readable fallback; its source attributes remain in the original.`)
        return inner() || fence(JSON.stringify(node.attribs), "json")
    }
  }
  const body = renderChildren(parse(revision.storage ?? "").children)
  return {
    markdown: `<a id="${headings.ids[0]}"></a>\n\n# ${escapeMarkdown(revision.title)}\n\n${body}\n`,
    findings,
    references,
    status: findings.some(item => item.severity !== "info") ? "fallback" : "native",
  }
}
