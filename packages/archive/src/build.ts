import {
  ARCHIVE_VERSION, CONVERTER_VERSION, LIMITS, MARKDOWN_PROFILE, archiveInputSchema, pathSchema,
  type ArchiveInput, type ArchiveManifest, type BuiltArchive, type Finding, type LocalReference,
} from "./contract"
import { convertStorage, headingIndex, type AssetTarget, type DocumentTarget } from "./markdown"
import { canonicalJson, compare, decodeBase64, escapeMarkdown, pathId, relativePath, safeFilename, sha256, sourceKey, utf8 } from "./util"
import { verifyArchive } from "./verify"

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`)
}

function validate(input: ArchiveInput) {
  if (Date.parse(input.startedAt) > Date.parse(input.completedAt)) throw new Error("Invalid observation interval")
  if (input.inventory.authority === "failed") throw new Error("Failed inventory cannot produce a successful archive")
  const namespaces = new Set(input.source.namespaces.map(namespace => namespace.id))
  unique([...input.source.namespaces.map(namespace => namespace.id)], "namespace")
  const spaceKeys = input.scope.spaces.map(space => `${space.namespaceId}\0${space.id}`)
  unique(spaceKeys, "space")
  for (const space of input.scope.spaces) if (!namespaces.has(space.namespaceId)) throw new Error("Unknown space namespace")
  const inventory = new Map(input.inventory.documents.map(item => [sourceKey(item), item]))
  unique(input.inventory.documents.map(sourceKey), "inventory document")
  unique(input.documents.map(sourceKey), "document")
  const documentMap = new Map(input.documents.map(document => [sourceKey(document), document]))
  if (input.scope.historyMode === "all_retrievable" && input.capabilities.history.status === "excluded") throw new Error("Requested history cannot be excluded")
  for (const item of input.inventory.documents) {
    if (!namespaces.has(item.namespaceId)) throw new Error("Unknown inventory namespace")
    if (!spaceKeys.includes(`${item.namespaceId}\0${item.spaceId}`)) throw new Error("Inventory document outside selected spaces")
    if (item.status !== "captured" && item.reason === null) throw new Error("Inventory gaps require a reason")
    if (item.status === "captured" && !documentMap.has(sourceKey(item))) throw new Error("Captured inventory item has no document")
  }
  const observations = [
    ...input.inventory.documents, ...Object.values(input.capabilities), ...input.assets, ...input.evidence, ...input.sourcePayloads,
    ...input.documents.flatMap(document => document.revisions),
  ]
  for (const observation of observations) {
    if (Date.parse(observation.observedAt) < Date.parse(input.startedAt) || Date.parse(observation.observedAt) > Date.parse(input.completedAt)) {
      throw new Error("Observation outside capture interval")
    }
  }
  for (const document of input.documents) {
    const item = inventory.get(sourceKey(document))
    if (!item || !["captured", "partial"].includes(item.status)) throw new Error("Document not accounted for in acquired inventory")
    if (item.spaceId !== document.spaceId) throw new Error("Document space conflicts with inventory")
    if (!spaceKeys.includes(`${document.namespaceId}\0${document.spaceId}`)) throw new Error("Document outside selected spaces")
    if ((document.parentState === "known") !== (document.parent !== null)) throw new Error("Parent state conflicts with parent identity")
    unique(document.revisions.map(revision => revision.id), "source revision")
    const current = document.revisions.find(revision => revision.id === document.currentRevisionId)
    if (!current) throw new Error("Current revision must have a captured or explicit missing record")
    if (item.status === "captured" && current.status !== "captured") throw new Error("Captured document has no current body")
    if (input.scope.historyMode === "current_only" && document.revisions.some(revision => revision.id !== document.currentRevisionId)) {
      throw new Error("Current-only scope cannot silently include historical content")
    }
    for (const revision of document.revisions) unique(revision.assetBindings.map(binding => binding.filename), "attachment binding")
  }
  unique(input.assets.map(asset => canonicalJson([asset.namespaceId, asset.id, asset.revisionId])), "asset revision")
  unique(input.evidence.map(record => canonicalJson([record.namespaceId, record.kind, record.id])), "evidence record")
  for (const asset of input.assets) {
    if (asset.namespaceId !== asset.document.namespaceId || !documentMap.has(sourceKey(asset.document))) throw new Error("Asset outside acquired document scope")
  }
  for (const record of input.evidence) if (!namespaces.has(record.namespaceId)) throw new Error("Unknown evidence namespace")
  unique(input.sourcePayloads.map(record => canonicalJson([record.namespaceId, record.id])), "source payload")
  for (const record of input.sourcePayloads) if (!namespaces.has(record.namespaceId)) throw new Error("Unknown source payload namespace")
}

/** Bounded in-memory builder. Provider acquisition and authorization happen upstream. */
export async function buildArchive(rawInput: unknown): Promise<BuiltArchive> {
  if (utf8.encode(JSON.stringify(rawInput)).byteLength > LIMITS.inputBytes) throw new Error("P0 input exceeds 8 MiB; streaming acquisition is not implemented")
  const input = archiveInputSchema.parse(rawInput)
  validate(input)
  input.source.namespaces.sort((a, b) => compare(a.id, b.id))
  input.scope.spaces.sort((a, b) => compare(canonicalJson([a.namespaceId, a.id]), canonicalJson([b.namespaceId, b.id])))
  input.inventory.documents.sort((a, b) => compare(sourceKey(a), sourceKey(b)))
  input.documents.sort((a, b) => compare(sourceKey(a), sourceKey(b)))
  input.assets.sort((a, b) => compare(canonicalJson([a.namespaceId, a.id, a.revisionId]), canonicalJson([b.namespaceId, b.id, b.revisionId])))
  input.evidence.sort((a, b) => compare(canonicalJson([a.namespaceId, a.kind, a.id]), canonicalJson([b.namespaceId, b.kind, b.id])))
  input.sourcePayloads.sort((a, b) => compare(canonicalJson([a.namespaceId, a.id]), canonicalJson([b.namespaceId, b.id])))
  for (const document of input.documents) {
    document.labels?.sort(compare)
    document.revisions.sort((a, b) => compare(a.id, b.id))
    for (const revision of document.revisions) revision.assetBindings.sort((a, b) => compare(a.filename, b.filename))
  }
  const files = new Map<string, Uint8Array>()
  const entries: ArchiveManifest["files"] = []
  const findings: Finding[] = []
  const references: LocalReference[] = []
  const anchors: ArchiveManifest["anchors"] = Object.create(null)
  let totalBytes = 0
  const add = async (path: string, value: string | Uint8Array, mediaType: string, listed = true) => {
    pathSchema.parse(path)
    if (files.has(path)) throw new Error("Archive path collision")
    const bytes = typeof value === "string" ? utf8.encode(value) : value
    totalBytes += bytes.byteLength
    if (files.size + 1 > LIMITS.files || totalBytes > LIMITS.bytes) throw new Error("Archive exceeds P0 memory limits")
    files.set(path, bytes)
    if (listed) entries.push({ path, bytes: bytes.byteLength, sha256: await sha256(bytes), mediaType })
  }
  const note = (code: string, message: string, documentKey: string | null = null, revisionId: string | null = null) => {
    findings.push({ code, severity: "warning", message, sourceKey: documentKey, revisionId, originalPath: null })
  }
  const link = (from: string, to: string, label: string) => {
    references.push({ from, to, fragment: null })
    return `[${escapeMarkdown(label)}](${relativePath(from, to)})`
  }
  const namespacePaths = new Map<string, string>()
  for (const namespace of input.source.namespaces) namespacePaths.set(namespace.id, `sites/${await pathId(namespace.id)}`)
  for (const payload of input.sourcePayloads) {
    const bytes = decodeBase64(payload.bytesBase64)
    if (await sha256(bytes) !== payload.sha256) throw new Error("Source payload checksum mismatch")
    await add(`${namespacePaths.get(payload.namespaceId)}/originals/payloads/${await pathId(payload.id)}.json`, bytes, "application/json")
    await add(`${namespacePaths.get(payload.namespaceId)}/metadata/payloads/${await pathId(payload.id)}.json`, canonicalJson({ namespaceId: payload.namespaceId, id: payload.id, observedAt: payload.observedAt, sha256: payload.sha256 }), "application/json")
  }
  const documentPaths = new Map<string, string>()
  for (const document of input.documents) {
    const folder = document.objectType === "page" ? "pages" : "blogposts"
    documentPaths.set(sourceKey(document), `${namespacePaths.get(document.namespaceId)}/${folder}/${await pathId(document.id)}.md`)
  }
  const targets = new Map<string, DocumentTarget>()
  for (const document of input.documents) {
    const current = document.revisions.find(revision => revision.id === document.currentRevisionId)!
    if (current.status === "captured") targets.set(sourceKey(document), {
      document, path: documentPaths.get(sourceKey(document))!, headings: headingIndex(current.storage!, current.title),
    })
  }
  const assetTargets: AssetTarget[] = []
  for (const asset of input.assets) {
    const bytes = decodeBase64(asset.bytesBase64)
    if (await sha256(bytes) !== asset.sha256) throw new Error("Asset checksum mismatch; archive generation stopped")
    const path = `${namespacePaths.get(asset.namespaceId)}/assets/${await pathId(asset.id)}/${await pathId(asset.revisionId)}/${safeFilename(asset.filename)}`
    await add(path, bytes, asset.mediaType)
    assetTargets.push({ asset, path })
    await add(`${namespacePaths.get(asset.namespaceId)}/metadata/assets/${await pathId(asset.id)}/${await pathId(asset.revisionId)}.json`, canonicalJson({ ...asset, bytesBase64: undefined, path, bytes: bytes.byteLength }), "application/json")
  }
  if (input.inventory.authority === "unknown") note("unknown_inventory_authority", input.inventory.explanation)
  for (const [capability, observation] of Object.entries(input.capabilities)) {
    if (observation.status !== "captured" && observation.status !== "excluded") note(`capability_${capability}`, `${capability}: ${observation.status}. ${observation.reason}`)
  }
  for (const item of input.inventory.documents) {
    if (item.status !== "captured") note("inventory_gap", `${item.status}: ${item.reason}`, sourceKey(item))
  }
  const spaceKeys = new Map(input.scope.spaces.map(space => [`${space.namespaceId}\0${space.id}`, space.key]))
  let capturedRevisions = 0
  for (const document of input.documents) {
    const key = sourceKey(document)
    const root = namespacePaths.get(document.namespaceId)!
    const kind = document.objectType === "page" ? "pages" : "blogposts"
    const objectId = await pathId(document.id)
    const metadataPath = `${root}/metadata/${kind}/${objectId}.json`
    const historyIndexPath = `${root}/history/${kind}/${objectId}/index.md`
    const historyRows: string[] = []
    if (document.parentState === "unknown") note("unknown_parent", "The source parent could not be established.", key)
    if (document.parent && !targets.has(sourceKey(document.parent))) note("unresolved_parent", "The original parent identity is retained; its content is outside captured scope or unavailable.", key)
    if ([document.creatorRef, document.ownerRef, document.lastEditorRef].includes(null)) note("unknown_authorship", "One or more source creator, owner or last-editor fields are unknown; no identity is inferred.", key)
    const revisionRecords: unknown[] = []
    for (const revision of document.revisions) {
      if (revision.status !== "captured") {
        note("missing_revision", `${revision.status}: ${revision.reason}`, key, revision.id)
        historyRows.push(`- Revision ${escapeMarkdown(revision.id)}: ${revision.status}. ${escapeMarkdown(revision.reason ?? "Unknown reason")}`)
        revisionRecords.push({ ...revision, assetBindings: revision.assetBindings, storage: undefined, markdownPath: null, originalPath: null })
        continue
      }
      capturedRevisions++
      const revisionId = await pathId(revision.id)
      const originalPath = `${root}/originals/${kind}/${objectId}/${revisionId}.xhtml`
      await add(originalPath, revision.storage!, "application/xhtml+xml")
      const historicalPath = `${root}/history/${kind}/${objectId}/${revisionId}.md`
      const currentPath = documentPaths.get(key)!
      const current = revision.id === document.currentRevisionId
      const paths = input.scope.historyMode === "all_retrievable" ? [...(current ? [currentPath] : []), historicalPath] : [currentPath]
      const headings = headingIndex(revision.storage!, revision.title)
      if (revision.authorRef === null) note("unknown_revision_author", "The source revision author is unknown; no author is inferred.", key, revision.id)
      const statuses: string[] = []
      for (const path of paths) {
        const converted = convertStorage({ document, revision, path, originalPath, current, headings, documents: targets, assets: assetTargets, spaceKeys })
        const footer = [link(path, metadataPath, "Document metadata"), ...(input.scope.historyMode === "all_retrievable" ? [link(path, historyIndexPath, "Source history")] : [])]
        await add(path, `${converted.markdown}\n---\n\nArchive records: ${footer.join(" · ")}\n`, "text/markdown")
        anchors[path] = headings.ids
        references.push(...converted.references)
        findings.push(...converted.findings)
        statuses.push(converted.status)
      }
      revisionRecords.push({ ...revision, storage: undefined, originalPath, markdownPaths: paths, conversionStatus: statuses.includes("fallback") ? "fallback" : "native" })
      if (input.scope.historyMode === "all_retrievable") historyRows.push(`- ${link(historyIndexPath, historicalPath, `Revision ${revision.id}: ${revision.title}`)} — source modified: ${revision.modifiedAt ?? "unknown"}; author: ${escapeMarkdown(revision.authorRef ?? "unknown")}`)
    }
    if (input.scope.historyMode === "all_retrievable") await add(historyIndexPath, `# Source history: ${escapeMarkdown(document.title)}\n\nThese are per-document source revisions, not historical whole-site snapshots. Missing revisions are listed without substitute content.\n\n${historyRows.join("\n")}\n`, "text/markdown")
    await add(metadataPath, canonicalJson({
      ...document, sourceKey: key, revisions: revisionRecords, currentPath: targets.get(key)?.path ?? null,
      parentSourceKey: document.parent ? sourceKey(document.parent) : null,
      historicalPermissionState: "unknown",
    }), "application/json")
  }
  for (const evidence of input.evidence) {
    const folder = ["principals", "memberships"].includes(evidence.kind) ? "identities" : "access"
    await add(`${namespacePaths.get(evidence.namespaceId)}/${folder}/${evidence.kind}/${await pathId(evidence.id)}.json`, canonicalJson(evidence), "application/json")
  }
  for (const space of input.scope.spaces) {
    const path = `${namespacePaths.get(space.namespaceId)}/spaces/${await pathId(space.id)}/index.md`
    const selected = [...targets.values()].filter(target => target.document.namespaceId === space.namespaceId && target.document.spaceId === space.id)
    await add(path, `# ${escapeMarkdown(space.name)}\n\n${selected.map(target => `- ${link(path, target.path, target.document.title)}`).join("\n") || "No current documents captured. See the coverage report."}\n`, "text/markdown")
  }
  const uniqueFindings = [...new Map(findings.map(finding => [canonicalJson(finding), finding])).values()]
    .sort((a, b) => compare(canonicalJson(a), canonicalJson(b)))
  const result = uniqueFindings.some(finding => finding.severity !== "info") ? "ready_with_gaps" : "ready"
  const counts = { requestedDocuments: input.inventory.documents.length, capturedDocuments: targets.size, capturedRevisions, assets: assetTargets.length }
  await add("reports/findings.json", canonicalJson(uniqueFindings), "application/json")
  const statuses = new Map<string, number>()
  for (const item of input.inventory.documents) statuses.set(item.status, (statuses.get(item.status) ?? 0) + 1)
  const live = input.source.adapter !== "confluence-storage-fixture"
  const sourceDescription = live ? `${input.source.adapter === "confluence-cloud-hosted" ? "Hosted" : "Local"} Confluence Cloud MVP. Only explicitly selected current pages are requested; this is not a whole-space or site backup.` : "Engineering proof with synthetic normalized input. No live source retrieval has been verified."
  await add("reports/coverage.md", [
    "# Coverage report", "", sourceDescription, "",
    `Result: ${result}. Inventory authority: ${input.inventory.authority}.`, "", escapeMarkdown(input.inventory.explanation), "",
    `Observed inventory records: ${counts.requestedDocuments}. Current documents captured: ${counts.capturedDocuments}. Retained revisions: ${counts.capturedRevisions}. Asset versions: ${counts.assets}.`, "",
    "Counts describe observed unique entities, not an independently established site total.", "",
    ...[...statuses].sort(([a], [b]) => compare(a, b)).map(([status, count]) => `- ${status}: ${count}`), "",
    `History mode: ${input.scope.historyMode}. Observation interval: ${input.startedAt} to ${input.completedAt}.`, "",
    ...Object.entries(input.capabilities).map(([name, value]) => `- ${name}: ${value.status}${value.reason ? ` — ${escapeMarkdown(value.reason)}` : ""}`), "",
    "## Findings", "",
    ...uniqueFindings.map(finding => `- ${finding.severity}: ${finding.code} — ${escapeMarkdown(finding.message)}${finding.sourceKey ? ` (${escapeMarkdown(finding.sourceKey)}${finding.revisionId ? `, revision ${escapeMarkdown(finding.revisionId)}` : ""})` : ""}`), "",
    `Checksums establish retained byte integrity, not source completeness. Source originals include exact supplied storage XHTML${input.sourcePayloads.length ? " and the retained selected-resource API response bytes" : "; no full API responses were supplied"}. Unknown history and access evidence remain unknown.`, "",
  ].join("\n"), "text/markdown")
  await add("reports/access.md", [
    "# Access evidence", "", "This full archive contains all included documents, histories, originals and sensitive identity/policy records.", "",
    "Evidence files do not enforce access after download. Anyone receiving these files can read them. Source authorship and organization ownership are not archive entitlements.", "",
    `Acquisition principal: ${escapeMarkdown(input.source.acquisitionPrincipalRef ?? "unknown")}.`, "",
    ...["permissions", "memberships", "identities"].map(name => {
      const value = input.capabilities[name as "permissions" | "memberships" | "identities"]
      return `- ${name}: ${value.status}. ${escapeMarkdown(value.reason ?? "Supplied evidence only; not independently evaluated.")}`
    }), "", "Historical permissions: unknown. Current observations are not historical ACLs. No effective-access decisions are inferred, and no hosted retrieval authorization is implemented by this package.", "",
  ].join("\n"), "text/markdown")
  const spaces = await Promise.all(input.scope.spaces.map(async space => ({ space, path: `${namespacePaths.get(space.namespaceId)}/spaces/${await pathId(space.id)}/index.md` })))
  await add("index.md", `# Archive navigation\n\n${spaces.map(({ space, path }) => `- ${link("index.md", path, space.name)}`).join("\n")}\n\n${link("index.md", "reports/coverage.md", "Coverage report")} · ${link("index.md", "reports/access.md", "Access evidence")}\n`, "text/markdown")
  await add("README.md", `# ConfluenceDitch archive\n\nFormat ${ARCHIVE_VERSION}; converter ${CONVERTER_VERSION}; profile ${MARKDOWN_PROFILE}.\n\n${sourceDescription} This is a full archive of its declared scope, including preserved originals. No destination account or service is needed to read its Markdown, JSON and local files.\n\nStart with ${link("README.md", "index.md", "archive navigation")} and ${link("README.md", "reports/coverage.md", "the coverage report")}.\n\nKeep originals inert. They contain untrusted source markup. This archive may include sensitive history and access evidence. Policy files cannot restrict a recipient's access.\n\nmanifest.json declares all content files and local link targets. checksums.sha256 also covers manifest.json. Verify with the provided archive verifier or a SHA-256 tool. Integrity checks do not establish source completeness, offline rendering fidelity or a production recovery point.\n`, "text/markdown")
  entries.sort((a, b) => compare(a.path, b.path))
  references.sort((a, b) => compare(canonicalJson(a), canonicalJson(b)))
  const manifest: ArchiveManifest = {
    formatVersion: ARCHIVE_VERSION, converterVersion: CONVERTER_VERSION, markdownProfile: MARKDOWN_PROFILE,
    sourceMode: input.source.adapter === "confluence-cloud-hosted" ? "live_hosted" : live ? "live_local" : "synthetic_fixture", sourceAdapter: input.source.adapter, sourceAdapterVersion: input.source.adapterVersion,
    organizationId: input.organizationId, captureId: input.captureId,
    observationInterval: { startedAt: input.startedAt, completedAt: input.completedAt },
    acquisitionPrincipalRef: input.source.acquisitionPrincipalRef,
    scope: input.scope, inventory: input.inventory, capabilities: input.capabilities,
    namespaces: input.source.namespaces.map(namespace => ({ ...namespace, path: namespacePaths.get(namespace.id)! })),
    result, recoveryPointEligible: false, counts, files: entries, localReferences: references, anchors,
  }
  await add("manifest.json", canonicalJson(manifest), "application/json", false)
  const checksums = [...entries.map(entry => `${entry.sha256}  ${entry.path}`), `${await sha256(files.get("manifest.json")!)}  manifest.json`].sort(compare).join("\n") + "\n"
  await add("checksums.sha256", checksums, "text/plain", false)
  const verified = await verifyArchive(files)
  if (!verified.ok) throw new Error(`Generated archive failed verification: ${verified.errors.join("; ")}`)
  return { files, manifest, findings: uniqueFindings }
}
