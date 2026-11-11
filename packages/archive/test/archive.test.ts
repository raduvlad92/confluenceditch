import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { readFile, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import test from "node:test"
import { build } from "esbuild"
import { buildArchive, verifyArchive, type ArchiveInput, type BuiltArchive } from "../src/index"
import { canonicalJson, sha256, utf8 } from "../src/util"

const seed = JSON.parse(await readFile(new URL("../fixtures/confluence-storage.json", import.meta.url), "utf8")) as ArchiveInput
const fixture = () => structuredClone(seed)
const decode = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes)
const currentFiles = (archive: BuiltArchive) => [...archive.files].filter(([path]) => /\/pages\/[^/]+\.md$/.test(path) && !path.includes("/history/"))
const currentText = (archive: BuiltArchive) => currentFiles(archive).map(([, bytes]) => decode(bytes)).join("\n")

test("builds an independently readable full archive and preserves exact original and asset bytes", async () => {
  const input = fixture()
  const archive = await buildArchive(input)
  assert.equal((await verifyArchive(archive.files)).ok, true)
  assert.deepEqual(archive.manifest.counts, { requestedDocuments: 2, capturedDocuments: 2, capturedRevisions: 3, assets: 1 })
  assert.equal(archive.manifest.result, "ready_with_gaps")
  assert.equal(archive.manifest.recoveryPointEligible, false)
  assert.equal(currentFiles(archive).length, 2)
  assert.equal([...archive.files.keys()].filter(path => path.includes("/history/") && !path.endsWith("index.md")).length, 3)
  assert.equal([...archive.files].find(([path]) => path.includes("/assets/") && path.endsWith(".txt"))?.[1].toString(), utf8.encode("Hello archive!\n").toString())
  const originals = [...archive.files].filter(([path]) => path.endsWith(".xhtml")).map(([, bytes]) => decode(bytes))
  for (const document of input.documents) for (const revision of document.revisions) assert.ok(originals.includes(revision.storage!))
  assert.ok(archive.manifest.files.some(file => file.mediaType === "application/json" && file.path.includes("identities/principals")))
  assert.ok(decode(archive.files.get("reports/access.md")).includes("Historical permissions: unknown"))
})

test("preserves sibling fragments, bold-first paragraphs, CDATA, Unicode, lists and tasks", async () => {
  const markdown = currentText(await buildArchive(fixture()))
  for (const expected of ["**Keep your knowledge.**", "This paragraph starts", "Überblick", "überblick-1", "1. Check a file", "- [x] Review the sample", "printf 'portable archive", "Supported checklist", "This macro body is retained", '[["team","Engineering"]]']) {
    assert.ok(markdown.includes(expected), `Missing: ${expected}`)
  }
})

test("conversion is deterministic despite worker/input order and changing capture timestamps", async () => {
  const input = fixture()
  const first = await buildArchive(input)
  input.documents.reverse()
  input.inventory.documents.reverse()
  for (const document of input.documents) document.revisions.reverse()
  const reordered = await buildArchive(input)
  assert.equal(canonicalJson([...first.files].sort()), canonicalJson([...reordered.files].sort()))
  input.captureId = "another-capture"
  input.startedAt = "2026-11-11T08:00:00Z"
  input.completedAt = "2026-11-11T10:00:00Z"
  const later = await buildArchive(input)
  for (const [path, bytes] of first.files) if (path.endsWith(".md") && path.startsWith("sites/")) assert.deepEqual(later.files.get(path), bytes)
})

test("long multiline text/code and embedded fence delimiters are never truncated", async () => {
  const input = fixture()
  const code = "line with `ticks` and ```fences```\n\n\n".repeat(4000)
  const prose = "Unicode Grüße and ordinary text. ".repeat(5000)
  input.documents[0].revisions[1].storage = `<p>${prose}</p><pre><code>${code}</code></pre>`
  const markdown = currentText(await buildArchive(input))
  assert.ok(markdown.includes(prose.trim()))
  assert.ok(markdown.includes(code))
  assert.ok(markdown.includes("````\n"))
})

test("inline wrapper spaces and meaningful table captions are retained", async () => {
  const input = fixture()
  input.documents[0].revisions[1].storage = "<p>one<span> two </span>three</p><table><caption>Caption survives</caption><tr><td>A</td><td>B</td></tr></table>"
  const markdown = currentText(await buildArchive(input))
  assert.ok(markdown.includes("one two three"))
  assert.ok(markdown.includes("Caption survives"))
})

test("layout cells and sections separate headings, paragraphs and macro fences", async () => {
  const input = fixture()
  input.documents[0].revisions[1].storage = '<ac:layout><ac:layout-section><ac:layout-cell><h2>First heading</h2></ac:layout-cell></ac:layout-section><ac:layout-section><ac:layout-cell><ac:structured-macro ac:name="unsupported"><ac:parameter ac:name="max">5</ac:parameter></ac:structured-macro></ac:layout-cell></ac:layout-section><ac:layout-section><ac:layout-cell><h2>Second heading</h2><p>Second section body</p></ac:layout-cell><ac:layout-cell><p>Another cell</p></ac:layout-cell></ac:layout-section></ac:layout>'
  const markdown = currentText(await buildArchive(input))
  assert.ok(markdown.includes("## First heading\n\nMacro:"))
  assert.ok(markdown.includes('```\n\n<a id="second-heading">'))
  assert.ok(markdown.includes("## Second heading\n\nSecond section body\n\nAnother cell"))
})

test("merged, ragged and nested tables retain cell contents with explicit findings", async () => {
  const input = fixture()
  input.documents[0].revisions[1].storage = '<table><tr><td colspan="2">Merged<table><tr><td>Nested</td></tr></table></td></tr><tr><td>Ragged</td><td>Tail</td></tr></table>'
  const archive = await buildArchive(input)
  const markdown = currentText(archive)
  for (const label of ["Merged", "Nested", "Ragged", "Tail"]) assert.ok(markdown.includes(label))
  assert.ok(archive.findings.some(finding => finding.code === "table_fallback"))
})

test("site, object type and case distinguish identities; titles and moves do not determine paths", async () => {
  const input = fixture()
  const duplicate = structuredClone(input.documents[0])
  duplicate.namespaceId = "another-site"
  duplicate.sourceUrl = "https://other.example.invalid/wiki/pages/1"
  input.source.namespaces.push({ id: "another-site", siteUrl: "https://other.example.invalid/wiki" })
  input.scope.spaces.push({ namespaceId: "another-site", id: "engineering", key: "ENG", name: "Personal space" })
  duplicate.revisions.forEach(revision => revision.assetBindings = [])
  input.documents.push(duplicate)
  input.inventory.documents.push({ ...input.inventory.documents[0], namespaceId: "another-site" })
  const post = structuredClone(duplicate)
  post.objectType = "blogpost"
  post.sourceUrl += "/post"
  input.documents.push(post)
  input.inventory.documents.push({ ...input.inventory.documents[0], namespaceId: "another-site", objectType: "blogpost" })
  const archive = await buildArchive(input)
  assert.equal(archive.manifest.counts.capturedDocuments, 4)
  const paths = currentFiles(archive).map(([path]) => path)
  assert.equal(new Set(paths.map(path => path.toLowerCase())).size, 3)
  input.documents[0].title = "Renamed page"
  input.documents[0].revisions[1].title = "Renamed page"
  const renamed = await buildArchive(input)
  assert.deepEqual(currentFiles(renamed).map(([path]) => path), paths)
})

test("local page links, relative history links and duplicate Unicode anchors reconcile", async () => {
  const input = fixture()
  input.documents[0].revisions[1].storage += '<p><a href="#Überblick">Self</a><a href="https://confluence.example.invalid/wiki/spaces/ENG/pages/1#überblick-1">Second heading</a><a href="/wiki/spaces/ENG/pages/2/Renamed-title">Renamed page</a><a href="/wiki/pages/viewpage.action?pageId=2">Legacy page URL</a></p>'
  const archive = await buildArchive(input)
  assert.ok(archive.manifest.localReferences.some(reference => reference.fragment === "überblick"))
  assert.ok(archive.manifest.localReferences.some(reference => reference.fragment === "überblick-1"))
  assert.ok(!archive.findings.some(finding => finding.code === "unresolved_source_link"))
  assert.equal((await verifyArchive(archive.files)).ok, true)
})

test("ambiguous titles, inaccessible parents and unknown anchors produce findings", async () => {
  const input = fixture()
  input.documents[0].revisions[1].storage += '<ac:link><ri:page ri:content-title="Handbook"/></ac:link><a href="#missing-heading">Missing</a>'
  input.documents[1].parent!.id = "outside-scope"
  const archive = await buildArchive(input)
  for (const code of ["unresolved_document", "unresolved_anchor", "unresolved_parent"]) assert.ok(archive.findings.some(finding => finding.code === code))
})

test("historical attachment references require exact version bindings", async () => {
  const input = fixture()
  input.documents[0].revisions[0].storage = '<ac:image><ri:attachment ri:filename="Read me.txt"/></ac:image>'
  const archive = await buildArchive(input)
  assert.ok(archive.findings.some(finding => finding.code === "unresolved_asset_version" && finding.revisionId === "1"))
  const historical = [...archive.files].filter(([path]) => path.includes("/history/")).map(([, bytes]) => decode(bytes)).join("\n")
  assert.ok(historical.includes("unresolved attachment version"))
})

test("missing revisions remain explicit and cannot borrow a current body", async () => {
  const input = fixture()
  input.documents[0].revisions[0] = { ...input.documents[0].revisions[0], status: "inaccessible", reason: "Permission denied", storage: null }
  const archive = await buildArchive(input)
  assert.equal(archive.manifest.counts.capturedRevisions, 2)
  assert.ok(archive.findings.some(finding => finding.code === "missing_revision"))
  input.documents[0].revisions[0].storage = "<p>Substituted current body</p>"
  await assert.rejects(buildArchive(input), /substitute body/)
})

test("unknown and failed inventory cannot become a green empty result", async () => {
  const input = fixture()
  input.documents = []; input.assets = []; input.evidence = []; input.inventory.documents = []
  input.inventory.authority = "unknown"
  const archive = await buildArchive(input)
  assert.equal(archive.manifest.result, "ready_with_gaps")
  input.inventory.authority = "failed"
  await assert.rejects(buildArchive(input), /Failed inventory/)
  input.inventory.authority = "selected_scope"
  input.capabilities = Object.fromEntries(Object.entries(input.capabilities).map(([name, value]) => [name, { ...value, status: "captured", reason: null }])) as ArchiveInput["capabilities"]
  assert.equal((await buildArchive(input)).manifest.result, "ready")
})

test("current-only output contains no historical revisions", async () => {
  const input = fixture()
  input.scope.historyMode = "current_only"
  await assert.rejects(buildArchive(input), /Current-only/)
  for (const document of input.documents) document.revisions = document.revisions.filter(revision => revision.id === document.currentRevisionId)
  const archive = await buildArchive(input)
  assert.equal([...archive.files.keys()].filter(path => path.includes("/history/")).length, 0)
})

test("unsafe source markup and URLs are inert, and no remote requests are made", async () => {
  const input = fixture()
  input.documents[0].revisions[1].storage = '<script>alert("secret")</script><iframe src="https://remote.invalid">Frame body</iframe><a href="javascript:alert(1)">Click</a><img src="https://remote.invalid/image.png" alt="Remote"/><p>&lt;script&gt;literal&lt;/script&gt;</p>'
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error("Unexpected network access") }
  try {
    const archive = await buildArchive(input)
    const markdown = currentText(archive)
    assert.ok(!markdown.includes("<script>"))
    assert.ok(!markdown.includes("<iframe"))
    assert.ok(!markdown.includes("javascript:"))
    assert.ok(!markdown.includes("![Remote]"))
    assert.ok(markdown.includes('alert("secret")'))
    assert.ok(markdown.includes("Frame body"))
    assert.ok(archive.findings.some(finding => finding.code === "unsafe_url"))
  } finally { globalThis.fetch = originalFetch }
})

test("unsafe filenames are confined to generated paths with original names in metadata", async () => {
  const input = fixture()
  input.assets[0].filename = "../../CON:evil\\..txt"
  const archive = await buildArchive(input)
  for (const path of archive.files.keys()) assert.ok(!path.split("/").some(part => part === ".." || part.includes(":")))
  assert.ok([...archive.files].some(([path, bytes]) => path.includes("metadata/assets") && decode(bytes).includes("CON:evil")))
})

test("asset checksum mismatches and noncanonical base64 block publication", async () => {
  const input = fixture()
  input.assets[0].sha256 = "0".repeat(64)
  await assert.rejects(buildArchive(input), /checksum mismatch/)
  input.assets[0].bytesBase64 = "../invalid!"
  await assert.rejects(buildArchive(input), /base64/)
})

test("duplicate entities, scope mismatch and unaccounted captured records fail reconciliation", async () => {
  const input = fixture()
  input.documents.push(structuredClone(input.documents[0]))
  await assert.rejects(buildArchive(input), /Duplicate document/)
  input.documents.pop()
  input.documents[0].spaceId = "not-selected"
  await assert.rejects(buildArchive(input), /space conflicts with inventory/)
  input.documents[0].spaceId = "engineering"
  input.documents.pop()
  await assert.rejects(buildArchive(input), /has no document/)
})

test("verification detects changed/missing bytes, unlisted files, bad links and manifest traversal", async () => {
  const archive = await buildArchive(fixture())
  const altered = new Map(archive.files)
  altered.set("index.md", utf8.encode("tampered"))
  assert.equal((await verifyArchive(altered)).ok, false)
  altered.delete("index.md")
  assert.ok((await verifyArchive(altered)).errors.some(error => error.startsWith("Missing file")))
  altered.set("extra.txt", utf8.encode("unlisted"))
  assert.ok((await verifyArchive(altered)).errors.some(error => error.startsWith("Unlisted file")))
  const badManifest = structuredClone(archive.manifest)
  badManifest.localReferences[0].to = "missing.md"
  const badLinks = new Map(archive.files).set("manifest.json", utf8.encode(canonicalJson(badManifest)))
  assert.ok((await verifyArchive(badLinks)).errors.some(error => error.includes("outside archive membership")))
  badManifest.files[0].path = "../escape.txt"
  badLinks.set("manifest.json", utf8.encode(canonicalJson(badManifest)))
  assert.ok((await verifyArchive(badLinks)).errors.includes("Missing or invalid manifest"))
})

test("real SHA-256 hashes are recorded for every manifest entry", async () => {
  const archive = await buildArchive(fixture())
  for (const entry of archive.manifest.files) assert.equal(await sha256(archive.files.get(entry.path)!), entry.sha256)
})

test("portable archive core bundles for a browser without Node runtime modules", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent",
  })
  assert.equal(bundle.outputFiles.length, 1)
})

test("CLI builds, verifies, refuses overwrite, detects corruption and rejects symbolic links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "confluenceditch-test-"))
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
  const source = fileURLToPath(new URL("../fixtures/confluence-storage.json", import.meta.url))
  const output = join(directory, "archive")
  const run = (...args: string[]) => promisify(execFile)(process.execPath, ["--import", "tsx", cli, ...args])
  try {
    await run("build", source, output)
    assert.match((await run("verify", output)).stdout, /verified/)
    await assert.rejects(run("build", source, output), /Output already exists/)
    await writeFile(join(output, "index.md"), "corrupted")
    await assert.rejects(run("verify", output), /Integrity mismatch/)
    await symlink(source, join(output, "escape.json"))
    await assert.rejects(run("verify", output), /Symbolic links/)
    assert.deepEqual((await readdir(directory)).sort(), ["archive"])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
