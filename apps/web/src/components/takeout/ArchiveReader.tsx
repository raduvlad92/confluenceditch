"use client"

import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { AlertCircle, Archive, ArrowLeft, CheckCircle2, Code2, Download, ExternalLink, FileText, FolderOpen, Loader2, Paperclip, ShieldCheck } from "lucide-react"
import type { LocalCapture } from "@/lib/local/types"
import { localRequest, apiUrl, downloadFile, authorizedFetch } from "./transport"
import styles from "./takeout.module.css"

const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`

export default function ArchiveReader({ capture, onNewTakeout }: { capture: LocalCapture; onNewTakeout(): void }) {
  const result = capture.result!
  const [tab, setTab] = useState<"preview" | "coverage" | "files">("preview")
  const [path, setPath] = useState(result.documents[0]?.path ?? "")
  const [markdown, setMarkdown] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [source, setSource] = useState(false)
  const [fileQuery, setFileQuery] = useState("")
  const articleRef = useRef<HTMLElement>(null)
  const pendingFragment = useRef<string | null>(null)
  const document = result.documents.find(document => document.path === path)
  const root = apiUrl(`captures/${capture.id}`)
  const fileUrl = (target: string) => `${root}/file?path=${encodeURIComponent(target)}`
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    setLoading(true); setError(""); setMarkdown("")
    localRequest<{ markdown: string }>(`captures/${capture.id}/document?path=${encodeURIComponent(path)}`, { signal: controller.signal }).then(reply => setMarkdown(reply.markdown)).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [capture.id, path])
  useEffect(() => {
    const headings = articleRef.current?.querySelectorAll("h1,h2,h3,h4,h5,h6")
    headings?.forEach((heading, index) => { heading.id = result.anchors[path]?.[index] ?? `section-${index}` })
    if (pendingFragment.current) {
      articleRef.current?.querySelector(`[id="${CSS.escape(pendingFragment.current)}"]`)?.scrollIntoView({ block: "start" })
      pendingFragment.current = null
    }
  }, [markdown, source, path, result.anchors, tab])
  function resolve(href: string): { path: string; fragment: string } | null {
    const url = new URL(href, `https://archive.invalid/${path}`)
    return url.origin === "https://archive.invalid" ? { path: decodeURIComponent(url.pathname.slice(1)), fragment: decodeURIComponent(url.hash.slice(1)) } : null
  }
  function openDocument(target: string, fragment: string) {
    pendingFragment.current = fragment || null
    if (target === path && fragment) articleRef.current?.querySelector(`[id="${CSS.escape(fragment)}"]`)?.scrollIntoView({ block: "start" })
    else setPath(target)
    setSource(false); setTab("preview")
  }
  const save = (url: string, filename: string) => { void downloadFile(url, filename).catch(error => setError(error.message)) }
  const bytes = result.files.reduce((total, file) => total + file.bytes, 0)
  return <div>
    <div className={styles.resultBar}><div className={styles.resultSummary}><span className={styles.resultIcon}><CheckCircle2 size={20} /></span><div><strong>{result.documents.length} pages captured{capture.pagesFailed ? `, ${capture.pagesFailed} unavailable` : ""}</strong><span>{capture.assetsDone} attachment{capture.assetsDone === 1 ? "" : "s"} included · {size(bytes)} uncompressed{result.sourceMode === "synthetic_fixture" ? " · Sample data" : ""}</span></div></div><a className={styles.primaryButton} href={`${root}/download`} onClick={event => { event.preventDefault(); save(`${root}/download`, `confluence-takeout-${capture.id.slice(0,8)}.zip`) }} download><Download size={17} /> Download archive <span>ZIP</span></a></div>
    {error && !loading && <div className={styles.error} role="alert">{error}</div>}
    <p className={styles.exportNote}>Includes original source files. Anyone you share the ZIP with can read all its contents.</p>
    <div className={styles.reader}>
      <div className={styles.readerTabs} role="tablist" aria-label="Archive view">{(["preview", "coverage", "files"] as const).map(name => <button key={name} role="tab" aria-selected={tab === name} aria-controls={`archive-${name}`} id={`tab-${name}`} onClick={() => setTab(name)} className={tab === name ? styles.activeTab : ""}>{name === "preview" ? <FileText size={16} /> : name === "coverage" ? <ShieldCheck size={16} /> : <FolderOpen size={16} />}{name === "preview" ? "Page preview" : name === "coverage" ? "Coverage report" : "Archive files"}{name === "coverage" && <span>{result.findings.length}</span>}</button>)}</div>
      {tab === "preview" ? <div className={styles.previewLayout} role="tabpanel" id="archive-preview" aria-labelledby="tab-preview">
        <nav className={styles.documentNav} aria-label="Captured pages"><div className={styles.navTitle}><FolderOpen size={16} /> Captured pages<span>{result.documents.length}</span></div>{result.documents.map(document => <button key={document.path} onClick={() => openDocument(document.path, "")} className={path === document.path ? styles.activeDocument : ""} aria-current={path === document.path ? "page" : undefined}><FileText size={16} /><span>{document.title}</span></button>)}<div className={styles.navFoot}><Archive size={15} /><span>These files remain readable<br />without this app.</span></div></nav>
        <div className={styles.previewPane}><div className={styles.previewToolbar}><span>Revision {document?.revision ?? "?"}</span><div><button className={source ? styles.sourceActive : ""} aria-pressed={source} onClick={() => setSource(!source)}><Code2 size={16} /> Markdown</button>{document && result.sourceMode !== "synthetic_fixture" && <a href={document.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open original page in Confluence"><ExternalLink size={15} /></a>}</div></div>
          {loading ? <div className={styles.loading}><Loader2 size={20} className={styles.spin} /> Opening page…</div> : error ? <div className={styles.error} role="alert">{error}</div> : source ? <pre className={styles.markdownSource}>{markdown}</pre> : <article className={styles.markdown} ref={articleRef}><ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
            a: ({ href = "", children }) => {
              let target: ReturnType<typeof resolve> = null
              try { target = resolve(href) } catch { return <span>{children}</span> }
              if (target) {
                const destination = target
                if (result.documents.some(document => document.path === destination.path)) return <a href={`#${encodeURIComponent(destination.fragment)}`} onClick={event => { event.preventDefault(); openDocument(destination.path, destination.fragment) }}>{children}</a>
                if (result.files.some(file => file.path === destination.path)) return <a href={fileUrl(destination.path)} onClick={event => { event.preventDefault(); save(fileUrl(destination.path), destination.path.split("/").at(-1)!) }} download>{children}</a>
                return <span>{children}</span>
              }
              return <a href={href} target="_blank" rel="noreferrer">{children}</a>
            },
            img: ({ src, alt }) => {
              let target: ReturnType<typeof resolve> = null
              try { target = typeof src === "string" ? resolve(src) : null } catch { /* Invalid references stay inert. */ }
              return target && result.files.some(file => file.path === target?.path && ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(file.mediaType)) ? <CapturedImage url={fileUrl(target.path)} alt={alt ?? "Captured image"} /> : <span>{alt ?? "Unresolved image"}</span>
            },
          }}>{markdown}</ReactMarkdown></article>}
          {document && document.findings > 0 && <button className={styles.pageFinding} onClick={() => setTab("coverage")}><AlertCircle size={16} /><span>{document.findings} finding{document.findings === 1 ? "" : "s"} for this page. Review the coverage report.</span></button>}
        </div>
      </div> : tab === "coverage" ? <section className={styles.coverage} role="tabpanel" id="archive-coverage" aria-labelledby="tab-coverage"><div className={styles.coverageHeading}><span className={styles.warningIcon}><FileCheckIcon /></span><div><h2>Captured with declared gaps</h2><p>Checksums and local file references passed. This does not establish a complete backup.</p></div></div><dl className={styles.capabilities}>{Object.entries(result.capabilities).map(([name, value]) => <div key={name}><dt>{name.charAt(0).toUpperCase() + name.slice(1)}</dt><dd><span className={value.status === "captured" ? styles.capturedStatus : styles.gapStatus}>{value.status}</span><p>{value.reason ?? "Requested current files were retrieved."}</p></dd></div>)}</dl><h3>Page and conversion findings</h3><div className={styles.findings}>{result.findings.map((finding, index) => <div key={index}><AlertCircle size={15} /><div><strong>{finding.sourceKey ? result.documents.find(document => document.sourceKey === finding.sourceKey)?.title ?? "Source item" : "Capture scope"}</strong><p>{finding.message}</p></div></div>)}</div></section> : <section className={styles.filesPanel} role="tabpanel" id="archive-files" aria-labelledby="tab-files"><div className={styles.filesHeading}><div><h2>{result.files.length} files in this archive</h2><p>Originals are preserved for inspection and future conversion. Keep source markup inert.</p></div><input className={styles.input} aria-label="Filter archive files" placeholder="Filter files…" value={fileQuery} onChange={event => setFileQuery(event.target.value)} /></div><div className={styles.fileList}>{result.files.filter(file => file.path.toLowerCase().includes(fileQuery.toLowerCase())).map(file => <a key={file.path} href={fileUrl(file.path)} onClick={event => { event.preventDefault(); save(fileUrl(file.path), file.path.split("/").at(-1)!) }} download className={styles.fileRow}>{file.path.includes("/assets/") ? <Paperclip size={16} /> : <FileText size={16} />}<span><strong>{file.path.split("/").at(-1)}</strong><small>{file.path}</small></span><span>{size(file.bytes)}</span><Download size={15} /></a>)}</div></section>}
    </div>
    <button className={`${styles.textButton} ${styles.anotherTakeout}`} onClick={onNewTakeout}><ArrowLeft size={15} /> Create another takeout</button>
  </div>
}

function FileCheckIcon() { return <ShieldCheck size={22} /> }

function CapturedImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState("")
  useEffect(() => {
    const controller = new AbortController(); let object = ""
    authorizedFetch(url, { signal: controller.signal }).then(response => response.blob()).then(blob => {
      if (!controller.signal.aborted) { object = URL.createObjectURL(blob); setSrc(object) }
    }).catch(() => { if (!controller.signal.aborted) setSrc("") })
    return () => { controller.abort(); if(object) URL.revokeObjectURL(object) }
  }, [url])
  return src ? <img src={src} alt={alt} loading="lazy" /> : <span>{alt}</span>
}
