import { z } from "zod"

export const ARCHIVE_VERSION = "0.3.0"
export const CONVERTER_VERSION = "0.2.2"
export const MARKDOWN_PROFILE = "confluence-takeout-markdown-1-p0"
export const LIMITS = { files: 10_000, bytes: 32 * 1024 * 1024, inputBytes: 8 * 1024 * 1024 }

const id = z.string().min(1).max(200)
const time = z.iso.datetime({ offset: true })
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const nullableLabel = z.string().max(2000).nullable()
const url = z.url().refine(value => ["https:", "http:"].includes(new URL(value).protocol), "Expected HTTP(S) URL")
const identity = { namespaceId: id, objectType: z.enum(["page", "blogpost"]), id }
export const acquisitionStatusSchema = z.enum([
  "captured", "partial", "inaccessible", "unavailable", "unsupported", "excluded", "failed", "unknown",
])
const observation = {
  status: acquisitionStatusSchema,
  observedAt: time,
  reason: z.string().min(1).max(4000).nullable(),
}
const observationSchema = z.strictObject(observation).refine(
  value => value.status === "captured" || value.reason !== null,
  "Non-captured observations require a reason",
)
const revisionSchema = z.strictObject({
  id,
  title: z.string().min(1).max(2000),
  authorRef: nullableLabel,
  modifiedAt: time.nullable(),
  ...observation,
  storage: z.string().max(2 * 1024 * 1024).nullable(),
  assetBindings: z.array(z.strictObject({ filename: id, assetId: id, revisionId: id })).max(1000),
}).superRefine((value, ctx) => {
  if (value.status === "captured" && value.storage === null) {
    ctx.addIssue({ code: "custom", message: "Captured revision requires its actual storage body" })
  }
  if (value.status !== "captured" && (value.storage !== null || value.reason === null)) {
    ctx.addIssue({ code: "custom", message: "A missing revision requires a reason and cannot contain a substitute body" })
  }
})

/** Normalized acquisition input. Native export packages are not accepted here. */
export const archiveInputSchema = z.strictObject({
  schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0"]),
  organizationId: id,
  captureId: id,
  startedAt: time,
  completedAt: time,
  source: z.strictObject({
    adapter: z.enum(["confluence-storage-fixture", "confluence-cloud-local", "confluence-cloud-hosted"]),
    adapterVersion: id,
    acquisitionPrincipalRef: nullableLabel,
    namespaces: z.array(z.strictObject({ id, siteUrl: url })).min(1).max(20),
  }),
  scope: z.strictObject({
    historyMode: z.enum(["all_retrievable", "current_only"]),
    spaces: z.array(z.strictObject({ namespaceId: id, id, key: id, name: id })).min(1).max(200),
  }),
  inventory: z.strictObject({
    authority: z.enum(["selected_scope", "unknown", "failed"]),
    explanation: z.string().min(1).max(4000),
    documents: z.array(z.strictObject({ ...identity, spaceId: id, ...observation })).max(200),
  }),
  capabilities: z.strictObject({
    history: observationSchema,
    assets: observationSchema,
    identities: observationSchema,
    memberships: observationSchema,
    permissions: observationSchema,
  }),
  documents: z.array(z.strictObject({
    ...identity,
    spaceId: id,
    sourceUrl: url,
    title: z.string().min(1).max(2000),
    parent: z.strictObject(identity).nullable(),
    parentState: z.enum(["known", "none", "unknown"]),
    creatorRef: nullableLabel,
    ownerRef: nullableLabel,
    lastEditorRef: nullableLabel,
    labels: z.array(id).max(1000).nullable(),
    currentRevisionId: id,
    revisions: z.array(revisionSchema).min(1).max(2000),
  })).max(200),
  assets: z.array(z.strictObject({
    namespaceId: id,
    id,
    revisionId: id,
    document: z.strictObject(identity),
    filename: id,
    mediaType: id,
    sourceUrl: url,
    observedAt: time,
    bytesBase64: z.string().max(12 * 1024 * 1024),
    sha256: hash,
  })).max(2000),
  evidence: z.array(z.strictObject({
    namespaceId: id,
    id,
    kind: z.enum(["principals", "memberships", "space_policy", "document_policy"]),
    observedAt: time,
    payload: z.record(z.string(), z.json()),
  })).max(2000),
  sourcePayloads: z.array(z.strictObject({
    namespaceId: id,
    id,
    observedAt: time,
    bytesBase64: z.string().max(4 * 1024 * 1024),
    sha256: hash,
  })).max(1000).default([]),
})

export type ArchiveInput = z.infer<typeof archiveInputSchema>
export type DocumentIdentity = ArchiveInput["documents"][number]["parent"] & {}
export type SourceDocument = ArchiveInput["documents"][number]
export type SourceRevision = SourceDocument["revisions"][number]
export type SourceAsset = ArchiveInput["assets"][number]
export type AcquisitionStatus = z.infer<typeof acquisitionStatusSchema>

export interface Finding {
  code: string
  severity: "info" | "warning" | "error"
  sourceKey: string | null
  revisionId: string | null
  message: string
  originalPath: string | null
}

export interface LocalReference {
  from: string
  to: string
  fragment: string | null
}

// Paths are generated internally, but the verifier also treats manifests as untrusted.
export const pathSchema = z.string().min(1).max(2000).refine(path =>
  path.split("/").every(part => /^[a-z0-9][a-z0-9._-]*$/i.test(part) && ![".", ".."].includes(part)) &&
  !path.split("/").some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
"Unsafe archive path")

export const manifestSchema = z.strictObject({
  formatVersion: z.enum(["0.1.0", "0.2.0", "0.3.0"]),
  converterVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  markdownProfile: z.literal(MARKDOWN_PROFILE),
  sourceMode: z.enum(["synthetic_fixture", "live_local", "live_hosted"]),
  sourceAdapter: archiveInputSchema.shape.source.shape.adapter,
  sourceAdapterVersion: id,
  organizationId: id,
  captureId: id,
  observationInterval: z.strictObject({ startedAt: time, completedAt: time }),
  scope: archiveInputSchema.shape.scope,
  inventory: archiveInputSchema.shape.inventory,
  capabilities: archiveInputSchema.shape.capabilities,
  acquisitionPrincipalRef: nullableLabel,
  namespaces: z.array(z.strictObject({ id, siteUrl: url, path: pathSchema })),
  result: z.enum(["ready", "ready_with_gaps"]),
  // A local fixture never establishes a production recovery point.
  recoveryPointEligible: z.literal(false),
  counts: z.strictObject({ requestedDocuments: z.number().int().nonnegative(), capturedDocuments: z.number().int().nonnegative(), capturedRevisions: z.number().int().nonnegative(), assets: z.number().int().nonnegative() }),
  files: z.array(z.strictObject({ path: pathSchema, sha256: hash, bytes: z.number().int().nonnegative().max(LIMITS.bytes), mediaType: z.string().max(200) })).max(LIMITS.files),
  localReferences: z.array(z.strictObject({ from: pathSchema, to: pathSchema, fragment: z.string().max(2000).nullable() })).max(100_000),
  anchors: z.record(pathSchema, z.array(z.string().regex(/^[\p{L}\p{N}_-]+$/u)).max(10_000)),
})

export type ArchiveManifest = z.infer<typeof manifestSchema>
export interface BuiltArchive {
  files: Map<string, Uint8Array>
  manifest: ArchiveManifest
  findings: Finding[]
}
