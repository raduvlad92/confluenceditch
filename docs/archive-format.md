# Archive format 0.3.0 — bounded MVP

This is an experimental, destination-independent format for normalized fixtures and a narrow local Confluence Cloud capture. It is not a hosted release, native uploaded-export format or production recovery contract. Runtime input and manifest schemas are exported from [`packages/archive/src/contract.ts`](../packages/archive/src/contract.ts). The [fixture](../packages/archive/fixtures/confluence-storage.json) is an executable example; [local testing](local-testing.md) describes the live connector.

## Versions and identities

The manifest records independent archive, source-adapter, converter and Markdown-profile versions. Native source revision IDs remain separate. A capture has its own ID, organization and observation interval; observations must fall inside that interval. Content modification times may precede the capture.

A document source key is `confluence:<encoded-namespace>:<page-or-blogpost>:<encoded-id>`. Components use `encodeURIComponent`. Identical native IDs in different sites or object types are distinct. Titles, parents and display names never establish identity.

Each `id-*` path component is the lowercase SHA-256 digest of the exact UTF-8 native ID. Paths remain stable through document renames and moves. The original IDs and names remain in JSON metadata. Attachment leaf names are prefixed, sanitized, bounded and lowercase; their original filename remains in asset metadata. Paths prohibit traversal, backslashes, drive prefixes and Windows device names. Actual Windows extraction and reader compatibility remain release gates; full paths can exceed older Windows path limits.

## Layout

```text
README.md
index.md
manifest.json
checksums.sha256
reports/coverage.md
reports/access.md
reports/findings.json
sites/id-<namespace-digest>/
  spaces/id-<space-digest>/index.md
  pages/id-<page-digest>.md
  blogposts/id-<post-digest>.md
  history/{pages,blogposts}/id-<object-digest>/
    index.md
    id-<revision-digest>.md
  originals/{pages,blogposts}/id-<object-digest>/id-<revision-digest>.xhtml
  assets/id-<asset-digest>/id-<revision-digest>/file-<safe-filename>
  metadata/{pages,blogposts}/id-<object-digest>.json
  metadata/assets/id-<asset-digest>/id-<revision-digest>.json
  identities/{principals,memberships}/id-<evidence-digest>.json
  access/{space_policy,document_policy}/id-<evidence-digest>.json
```

Brace expressions illustrate alternatives, not literal directories. Only supplied evidence produces evidence files. Missing content has explicit status/reason records and no fabricated body. Current documents link to their metadata and available source-history index. Hierarchy remains in document metadata; the P0 space navigation is flat.

`all_retrievable` preserves every supplied revision observation, including missing-revision records. Current revisions appear both at their canonical path and in source history. `current_only` rejects historical input and omits the history tree. Both modes produce a full sensitive archive of their selected scope; a separately filtered current-content distribution is not implemented.

## Originals, assets and metadata

Each captured revision preserves its exact supplied storage XHTML as UTF-8, independently of Markdown conversion. The live local adapter also supplies exact selected-resource API response bytes in `sourcePayloads`, stored in `originals/payloads/id-<payload-digest>.json`, with hashed observation metadata in `metadata/payloads/`. These JSON bytes are independently hashed before packaging. Fixtures need not contain full API responses. Original vendor export packages are not supported. Do not execute original markup; it is untrusted.

Asset records contain exact base64 bytes and an expected SHA-256 digest. The builder rejects noncanonical base64 and checksum mismatches. A revision's `assetBindings` explicitly associates attachment filenames with native asset/revision identities. Unknown historical asset versions stay unresolved; current files are never silently substituted. Raw evidence retains its namespace, native ID, kind and observation time. No permission evaluator is implemented.

Document metadata separates creator, designated owner, last editor, revision author, modification time, parent identity and observation time. Unknown fields are `null`; no identities or historical permissions are inferred. Policy evidence is not a grant of hosted or offline access.

## Markdown profile

`confluence-takeout-markdown-1-p0` uses CommonMark headings, paragraphs, emphasis, code, quotations and lists plus GFM task lists, tables and strikethrough. The only generated HTML is an inert heading anchor and table-cell line break. Source HTML is never passed through as active HTML.

Heading anchors use NFKC normalization, lowercase, Unicode letters/numbers, underscores and hyphens. Other punctuation is removed; whitespace/hyphen runs become a hyphen; an empty heading becomes `section`. Duplicate anchors receive `-1`, `-2`, etc. The document title participates first. Explicit generated anchors avoid dependence on a reader's own slug algorithm. Readers stripping anchors will still display headings but may lose fragment navigation; a tested reader matrix is pending.

Supported constructs include root sibling fragments, CDATA in code macros, nested mixed lists, task states, long code/text, simple tables, mapped page links and exact asset bindings. Unknown macros retain their name, parameters and available bodies with a finding. Complex tables use labeled cells; layouts retain reading order. Active markup becomes fenced text. External images become ordinary reference links, with findings; conversion never fetches external content. External hyperlinks remain online references and are outside the local-link guarantee.

Each converted revision records `native` or `fallback` independently of acquisition status. Findings identify source object/revision, severity, cause and original path where available. Conversion output never truncates content to fit an allowance: oversize inputs/outputs fail. Capture timestamps are absent from normalized document Markdown, so unchanged content does not change just because a later capture ran. JSON object keys, entity order and file membership are deterministic.

## Coverage and verification

Inventory distinguishes `captured`, `partial`, `inaccessible`, `unavailable`, `unsupported`, `excluded`, `failed` and `unknown`, with reasons and observation times. It covers observed unique records, not undiscovered site totals. Every supplied document must reconcile to acquired selected-scope inventory; every captured inventory document requires a captured current body. Missing current bodies can only appear under partial acquisition.

Unknown inventory authority or unresolved acquisition/conversion gaps produce `ready_with_gaps`. Failed inventory prevents output creation, including empty outputs. A confirmed synthetic empty scope is distinct. `sourceMode` distinguishes `synthetic_fixture`, `live_local` and `live_hosted`; `ready` describes the declared narrow output only, and `recoveryPointEligible` is always `false` for this local prototype. Archive formats 0.1.0 and 0.2.0 remain verifiable; converter versions are recorded independently rather than requiring the currently installed converter to verify old bytes.

`manifest.json` lists each content file's path, SHA-256 digest, exact byte count and media type. It includes local reference and anchor registries. `checksums.sha256` covers the listed files and the exact manifest bytes; it excludes itself to avoid a digest cycle. Entries use conventional `digest  path` lines. Neither a checksum nor an internally consistent manifest is a signature or a source-completeness attestation.

The offline verifier rejects missing, changed, unlisted, duplicate/case-colliding or unsafe file paths, absent required reports, inconsistent checksum listings, declared missing local targets and declared missing anchors. The CLI additionally rejects symbolic links and special files, bounds traversal and verifies a disk read-back before publishing a new local directory. This is structural verification, not a complete Markdown parser, browser renderer, malware scanner or hardened customer-upload service.

P0 limits are 8 MiB normalized input, 32 MiB total output, 10,000 files, 200 documents and 2,000 supplied asset versions. Additional schema bounds apply to individual fields. Generation is in memory. These limits are unrelated to the PRD's unproved pilot/public capacity targets; streaming, package splitting and ZIP delivery are pending.
