"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Archive, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Circle, FileCheck2, FileText, FolderOpen, HelpCircle, Link2, Loader2, LockKeyhole, Monitor, Paperclip, Search, ShieldCheck, Unplug, X } from "lucide-react"
import type { LocalCapture, LocalConnection, LocalPage, LocalSession, LocalSpace } from "@/lib/local/types"
import ArchiveReader from "./ArchiveReader"
import styles from "./takeout.module.css"

import { localRequest, isHosted } from "./transport"

export default function TakeoutApp() {
  const hosted = isHosted()
  const [connection, setConnection] = useState<LocalConnection | null>(null)
  const [capture, setCapture] = useState<LocalCapture | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [help, setHelp] = useState(false)
  const [spaces, setSpaces] = useState<LocalSpace[]>([])
  const [spaceId, setSpaceId] = useState("")
  const [spacesCursor, setSpacesCursor] = useState<string | null>(null)
  const [pages, setPages] = useState<LocalPage[]>([])
  const [pagesCursor, setPagesCursor] = useState<string | null>(null)
  const [pagesLoading, setPagesLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [attachments, setAttachments] = useState(true)
  const [pollAttempt, setPollAttempt] = useState(0)
  const [pollError, setPollError] = useState("")
  const command = useRef<{ fingerprint: string; key: string } | null>(null)
  const helpRef = useRef<HTMLDialogElement>(null)
  const busyRef = useRef(false)
  const hasCapture = Boolean(capture)

  useEffect(() => {
    const controller = new AbortController()
    localRequest<LocalSession>("session", { signal: controller.signal }).then(session => {
      setEnabled(session.enabled); setConnection(session.connection); setCapture(session.capture)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setInitializing(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => { if (help) helpRef.current?.showModal(); else helpRef.current?.close() }, [help])

  useEffect(() => {
    if (!connection || hasCapture) return
    const controller = new AbortController()
    setBusy(true)
    localRequest<{ spaces: LocalSpace[]; cursor: string | null }>("spaces", { signal: controller.signal }).then(result => {
      setSpaces(result.spaces); setSpacesCursor(result.cursor); setSpaceId(result.spaces[0]?.id ?? "")
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [connection, hasCapture])
  useEffect(() => {
    if (!connection || !spaceId || hasCapture) return
    const controller = new AbortController()
    setPagesLoading(true); setPages([]); setSelected(new Set()); setQuery(""); setError("")
    localRequest<{ pages: LocalPage[]; cursor: string | null }>(`pages?spaceId=${encodeURIComponent(spaceId)}`, { signal: controller.signal }).then(result => {
      setPages(result.pages); setPagesCursor(result.cursor)
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setPagesLoading(false) })
    return () => controller.abort()
  }, [connection, spaceId, hasCapture])
  const captureId = capture?.id
  const running = capture?.status === "queued" || capture?.status === "running"
  useEffect(() => {
    if (!captureId || !running) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    setPollError("")
    const poll = async () => {
      try {
        const result = await localRequest<{ capture: LocalCapture }>(`captures/${captureId}`, { signal: controller.signal })
        setCapture(result.capture)
        if (["queued", "running"].includes(result.capture.status)) timer = setTimeout(poll, hosted ? 2500 : 800)
      } catch (error) { if (!controller.signal.aborted) setPollError(error instanceof Error ? error.message : "Progress could not be refreshed.") }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [captureId, running, pollAttempt])

  async function connectSite(values: { siteUrl: string; email: string; token: string } | null) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError("")
    try {
      const result = await localRequest<{ connection: LocalConnection }>("connect", { method: "POST", body: JSON.stringify(values ? { mode: "live", ...values } : { mode: "demo" }) })
      setCapture(null); setSpaces([]); setSpaceId(""); setConnection(result.connection)
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect.") }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setError("")
    try {
      await localRequest("session", { method: "DELETE" })
      setConnection(null); setCapture(null); setSpaceId(""); setSpaces([]); setPages([]); setSelected(new Set()); command.current = null
    } catch (error) { setError(error instanceof Error ? error.message : "Could not disconnect.") }
    finally { setBusy(false) }
  }
  async function loadMore(kind: "spaces" | "pages") {
    setBusy(true); setError("")
    try {
      if (kind === "spaces" && spacesCursor) {
        const result = await localRequest<{ spaces: LocalSpace[]; cursor: string | null }>(`spaces?cursor=${encodeURIComponent(spacesCursor)}`)
        setSpaces(previous => [...new Map([...previous, ...result.spaces].map(space => [space.id, space])).values()]); setSpacesCursor(result.cursor)
      } else if (kind === "pages" && pagesCursor) {
        const result = await localRequest<{ pages: LocalPage[]; cursor: string | null }>(`pages?spaceId=${spaceId}&cursor=${encodeURIComponent(pagesCursor)}`)
        setPages(previous => [...new Map([...previous, ...result.pages].map(page => [page.id, page])).values()]); setPagesCursor(result.cursor)
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load more.") }
    finally { setBusy(false) }
  }
  function togglePage(id: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else if (next.size < 20) next.add(id)
      return next
    })
  }
  async function createTakeout() {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError("")
    const body = { spaceId, pageIds: [...selected].sort(), includeAttachments: attachments }
    const fingerprint = JSON.stringify(body)
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, key: crypto.randomUUID() }
    try {
      const result = await localRequest<{ capture: LocalCapture }>("captures", { method: "POST", headers: { "Idempotency-Key": command.current.key }, body: fingerprint })
      setCapture(result.capture)
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create the takeout.") }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function cancel() {
    if (!capture) return
    try { const result = await localRequest<{ capture: LocalCapture }>(`captures/${capture.id}`, { method: "DELETE" }); setCapture(result.capture) }
    catch (error) { setError(error instanceof Error ? error.message : "Could not cancel.") }
  }
  const completed = capture?.status === "ready" || capture?.status === "ready_with_gaps"
  const step = completed || capture ? 2 : connection ? 1 : 0
  const visiblePages = pages.filter(page => page.title.toLowerCase().includes(query.toLowerCase()))
  const newTakeout = () => { setCapture(null); setSelected(new Set()); setError(""); command.current = null }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <a href="/" className={styles.brand} aria-label="ConfluenceDitch home"><span className={styles.brandMark}><Archive size={21} strokeWidth={1.8} /></span>Confluence<span>Ditch</span></a>
        <div className={styles.headerRight}><span className={styles.localBadge}><Monitor size={14} /> {hosted ? "MVP" : "Local test"}</span><button className={styles.helpButton} aria-label="How it works" onClick={() => setHelp(true)}><HelpCircle size={17} /><span>How it works</span></button></div>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}><div><h1>{completed ? "Your takeout is ready to review" : "Create a Confluence takeout"}</h1><p>{completed ? "Open a page, review the gaps, and keep a copy." : "A readable copy of your pages and files. Yours to keep."}</p></div><span className={styles.readOnly}><ShieldCheck size={16} /> Read-only access</span></div>
        <ol className={styles.steps} aria-label="Takeout progress">{["Connect Confluence", "Choose pages", "Review & download"].map((label, index) => <li key={label} className={index === step ? styles.activeStep : index < step ? styles.doneStep : ""} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={13} /> : index + 1}</span>{label}{index < 2 && <ChevronRight size={15} className={styles.stepArrow} />}</li>)}</ol>
        {error && <div className={styles.error} role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
        {initializing ? <div className={styles.loading}><Loader2 size={22} className={styles.spin} /> Opening your workspace…</div> : !connection ? (
          <div className={styles.connectLayout}>
            <ConnectionForm busy={busy} enabled={enabled} onConnect={connectSite} />
            <aside className={styles.connectAside}>
              <div className={styles.archiveIllustration} aria-hidden="true"><div className={styles.paperBack} /><div className={styles.paper}><FileText size={28} /><span /><span /><span /><div><CheckCircle2 size={15} /> Portable by design</div></div><span className={styles.folderTab}><FolderOpen size={23} /></span></div>
              <h2>Knowledge you can open anywhere.</h2><p>Start with a few pages. Get ordinary files you can read without Confluence.</p>
              <ul className={styles.included}><li><FileText size={17} /> Readable Markdown pages</li><li><Paperclip size={17} /> Local attachment files</li><li><Archive size={17} /> Preserved source material</li><li><FileCheck2 size={17} /> A report of what’s missing</li></ul>
              <div className={styles.sampleRow}><div><strong>See an example first</strong><span>Three sample pages. No Confluence connection needed.</span></div><button className={styles.textButton} disabled={busy || !enabled} onClick={() => connectSite(null)}>Try sample <ArrowRight size={15} /></button></div>
            </aside>
          </div>
        ) : <>
          <div className={styles.connectionBar}><span className={styles.connectionIcon}><Link2 size={18} /></span><div><strong>{new URL(connection.siteUrl).hostname}</strong><span>{connection.displayName}{connection.mode === "demo" ? " · Sample data" : ""}</span></div><button className={styles.textButton} disabled={busy} onClick={disconnect}>{connection.mode === "demo" ? <><Unplug size={15} /> Connect your site</> : <><Unplug size={15} /> Disconnect</>}</button></div>
          {capture ? completed && capture.result ? <ArchiveReader capture={capture} onNewTakeout={newTakeout} /> : (
            <section className={styles.progressPanel} aria-live="polite">
              {running ? <Loader2 className={styles.spin} size={32} /> : <Circle size={32} />}
              <h2>{running ? capture.phase === "retrieving" ? "Collecting your selected pages" : capture.phase === "converting" ? "Creating readable Markdown" : "Checking the archive" : capture.status === "cancelled" ? "Takeout cancelled" : "This takeout needs attention"}</h2>
              <p>{capture.error ?? (running ? "You can refresh this page; the export keeps working." : "Your Confluence pages have not been changed.")}</p>
              <div className={styles.progressTrack}><span style={{ width: `${Math.round((capture.pagesDone + capture.pagesFailed) / Math.max(1, capture.pagesTotal) * 100)}%` }} /></div>
              <span className={styles.progressCount}>{capture.pagesDone} of {capture.pagesTotal} pages captured{capture.pagesFailed ? ` · ${capture.pagesFailed} unavailable` : ""}{capture.assetsDone ? ` · ${capture.assetsDone} files` : ""}</span>
              {pollError && <div className={styles.error}><span>Progress is stale: {pollError}</span><button className={styles.textButton} onClick={() => setPollAttempt(value => value + 1)}>Refresh status</button></div>}
              {running ? <button className={styles.secondaryButton} onClick={cancel}>Cancel takeout</button> : <button className={styles.primaryButton} onClick={newTakeout}><ArrowLeft size={16} /> Choose pages again</button>}
            </section>
          ) : (
            <div className={styles.selectionLayout}>
              <section className={styles.pageSelection}>
                <div className={styles.selectionHeader}><h2>Choose what to keep</h2><span>{selected.size} selected</span></div>
                <label className={styles.fieldLabel} htmlFor="space">Confluence space</label>
                <select id="space" className={styles.input} value={spaceId} disabled={busy} onChange={event => setSpaceId(event.target.value)}>{spaces.length ? spaces.map(space => <option key={space.id} value={space.id}>{space.name}{space.type === "personal" ? " (personal)" : ""}</option>) : <option value="">{busy ? "Loading spaces…" : "No accessible spaces"}</option>}</select>
                {spacesCursor && <button className={styles.textButton} disabled={busy} onClick={() => loadMore("spaces")}>Load more spaces</button>}
                <div className={styles.searchField}><Search size={17} /><input aria-label="Find a page" placeholder="Find a page in the loaded list…" value={query} onChange={event => setQuery(event.target.value)} /></div>
                <div className={styles.pageList} aria-label="Published pages">
                  {pagesLoading ? <div className={styles.loading}><Loader2 size={19} className={styles.spin} /> Loading pages…</div> : visiblePages.length ? visiblePages.map(page => {
                    const unsupported = page.status !== "current" || page.subtype === "live"
                    return <label key={page.id} className={`${styles.pageRow} ${selected.has(page.id) ? styles.selectedPage : ""}`}><input type="checkbox" aria-label={`Select ${page.title}`} checked={selected.has(page.id)} disabled={unsupported || (!selected.has(page.id) && selected.size >= 20)} onChange={() => togglePage(page.id)} /><FileText size={18} /><span><strong>{page.title}</strong><small>{unsupported ? "This content type is not supported in this release" : page.version ? `Revision ${page.version.number}` : "Current published page"}</small></span></label>
                  }) : <div className={styles.empty}>{query ? "No loaded pages match your search." : "No published pages are visible in this space. Try another space or check this account’s access."}</div>}
                </div>
                <div className={styles.listFooter}><span>{pages.length} pages loaded. Only your selection will be exported.</span>{pagesCursor && <button className={styles.textButton} disabled={busy} onClick={() => loadMore("pages")}>Load more pages</button>}</div>
              </section>
              <aside className={styles.scopePanel}>
                <span className={styles.scopeIcon}><Archive size={24} /></span><h2>Your takeout</h2><p>Start small and inspect the result.</p>
                <dl className={styles.scopeList}><div><dt>Pages</dt><dd>{selected.size ? `${selected.size} selected` : "Choose a few"}</dd></div><div><dt>Content</dt><dd>Current published revision</dd></div><div><dt>Format</dt><dd>Markdown + original source</dd></div><div><dt>Delivery</dt><dd>Downloadable ZIP</dd></div></dl>
                <label className={styles.attachmentOption}><input type="checkbox" checked={attachments} onChange={event => setAttachments(event.target.checked)} /><span><strong>Include attachments</strong><small>Up to 1 MiB per file, 2 MiB total.</small></span></label>
                <div className={styles.scopeNote}><FileCheck2 size={17} /><p>This MVP captures up to 20 pages. Source history, comments and permissions are outside its scope and will be listed in the report.</p></div>
                <button className={styles.primaryButton} disabled={busy || pagesLoading || !selected.size} onClick={createTakeout}>{busy ? <Loader2 size={17} className={styles.spin} /> : <Archive size={17} />} Create takeout</button>
                <span className={styles.localHint}><LockKeyhole size={13} /> {hosted ? "Private to your account · Expires after 24 hours" : "Kept in this local session only"}</span>
              </aside>
            </div>
          )}
        </>}
        <footer className={styles.footer}><span>ConfluenceDitch</span><span>Keep the knowledge. Choose its next home later.</span></footer>
      </main>
      <dialog ref={helpRef} className={styles.helpDialog} onCancel={() => setHelp(false)} onClick={event => { if (event.target === helpRef.current) setHelp(false) }}><div className={styles.dialogTitle}><h2>A small, direct export</h2><button className={styles.iconButton} onClick={() => setHelp(false)} aria-label="Close help"><X size={20} /></button></div><ol><li>Enter your Confluence Cloud site, Atlassian email, and API token.</li><li>Choose a space and select up to 20 published pages.</li><li>Create the takeout, inspect a page and its report, then download the ZIP.</li></ol><p>{hosted ? "The connector only sends read requests. Your token is encrypted, and exports are private to your signed-in account. Connections and exports expire after 24 hours. Disconnecting revokes access and clears your credentials. Up to five exports per account per day." : "The connector only sends read requests. Your token and archive stay in the local server’s memory for up to two hours, until you disconnect, or until the server restarts."}</p><p>The ZIP includes originals. Anyone you share it with can read all its files. This release does not capture source permissions or source history.</p><a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className={styles.textButton}>Manage Atlassian API tokens <ArrowRight size={15} /></a></dialog>
    </div>
  )
}

function ConnectionForm({ busy, enabled, onConnect }: { busy: boolean; enabled: boolean; onConnect(values: { siteUrl: string; email: string; token: string }): Promise<void> }) {
  const [siteUrl, setSiteUrl] = useState("")
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault()
    await onConnect({ siteUrl: siteUrl.trim(), email: email.trim(), token: token.trim() })
    setToken("")
  }
  return <section className={styles.connectPanel}><div className={styles.panelHeading}><span className={styles.confluenceMark}><Link2 size={25} /></span><div><h2>Connect your Confluence site</h2><p>Use a read-only Atlassian API token.</p></div></div><form onSubmit={submit}>
    <label className={styles.fieldLabel} htmlFor="site-url">Site URL</label><input className={styles.input} id="site-url" type="url" required placeholder="https://your-team.atlassian.net" value={siteUrl} onChange={event => setSiteUrl(event.target.value)} autoComplete="url" />
    <label className={styles.fieldLabel} htmlFor="atlassian-email">Atlassian email</label><input className={styles.input} id="atlassian-email" type="email" required placeholder="you@company.com" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" />
    <div className={styles.labelRow}><label className={styles.fieldLabel} htmlFor="api-token">API token</label><a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Create a token</a></div><input className={styles.input} id="api-token" type="password" required placeholder="Paste your Atlassian API token" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" spellCheck={false} />
    <p className={styles.tokenHint}>Use a token from your Atlassian account. Scoped tokens need read access to users, spaces, pages and attachments.</p>
    <button type="submit" className={styles.primaryButton} disabled={busy || !enabled}>{busy ? <Loader2 size={17} className={styles.spin} /> : <Link2 size={17} />} {busy ? "Connecting…" : "Connect Confluence"}{!busy && <ArrowRight size={16} />}</button>
    {!enabled && <p className={styles.error}>The local connector is not enabled on this server.</p>}
    <p className={styles.credentialNote}><LockKeyhole size={15} /><span>{isHosted() ? <>Credentials are encrypted. Exports expire after 24 hours.<br />Disconnecting clears credentials and revokes export access.</> : <>Credentials are kept in memory, never saved to disk.<br />Disconnecting clears the connection and local takeouts.</>}</span></p>
  </form></section>
}
