# Implementation status

Updated 2026-11-11. Scope: local visual Confluence Cloud test flow plus portable archive core from PRD section 21.

The home screen now provides direct API-token connection, space/page selection, capture progress, Markdown preview, coverage, file inspection and ZIP download. `packages/confluence` performs read-only source acquisition; `apps/web/src/app/api/local` gates the ephemeral local session. No database/Redis setup is required. See [local testing](local-testing.md).

Implemented in `packages/archive`:

- Versioned normalized-input/manifest schemas, selected-space scope and namespaced source identity.
- A bounded portable archive builder, preserving exact supplied storage XHTML independently of conversion.
- Deterministic current/history Markdown, source-history indexes, local assets and provenance metadata.
- Explicit acquisition, conversion, inventory-authority and access-evidence qualifications.
- File membership, SHA-256 checksums, declared local-link/anchor verification and a disk read-back.
- Local build/verify commands with exclusive output creation, private permissions and no-overwrite behavior.
- Synthetic fixtures and regression tests, plus an explicitly authorized local live connection.

Validation commands are in the root README. `pnpm test` includes the browser-target bundle check. The generated sample belongs in ignored `artifacts/`; it should report `ready_with_gaps`. Passing local checks does not establish source completeness, browser rendering, live runtime behavior or customer acceptance.

The full P0 gate remains open. The production implementation sequence is:

1. Prove actual Cloudflare Workers/Workflows/Queues and one Neon/Prisma connection path locally/on an isolated deployment. Resolve A01 before provisioning; a fixture does not require that decision.
2. Introduce organization/member grants and independent source/capture/item/output records with tenant-scoped constraints. Keep Neon lifecycle truth separate from object storage and job coordination. Do not extend the destination-required migration record.
3. Implement private R2 immutable originals, object checksums, durable capture checkpoints, ID/reference-only work messages and reconciliation after interruption. Preserve raw provider payloads before conversion.
4. Repair source OAuth binding/rotation and prove Cloud live inventory, historical bodies and attachment bytes with an authorized test tenant. Do not reuse the current OAuth flow as production-ready.
5. Normalize identity/policy observations, prove capability authority and complete the PRD's no-silent-loss, authorization, offline usability and recovery fixtures before an assisted pilot.

R1/R2 remain unreleased. The bounded hosted MVP adds Clerk, Cloudflare Workers/Workflows, private R2 and Neon; see [hosted MVP operations](hosted-mvp.md). The local live test below predates the hosted deployment. The user explicitly authorized a live test in their external Chrome session. A Confluence-only token with four read scopes was created with expiry 2026-11-12; its value is never recorded here. The first live current-page capture was downloaded and exposed a layout cell/section separator bug, now repaired with a regression fixture. A restricted synthetic `CDTEST` space was created separately through the source UI; the exporter itself remains read-only.

Live verification completed 2026-11-11 through external Chrome:

- Created restricted **ConfluenceDitch export test** (`CDTEST`). Confluence seeded its overview and two live-document templates; live documents are visibly unsupported and disabled in the page picker.
- Published **Export verification — Unicode, links and file**, with synthetic content and `release-notes.txt` (346 UTF-8 bytes).
- Captured the two selected published pages and one attachment in capture `1f0f2216-a2d6-4cb8-a726-ae7b720d5322`. Result is `ready_with_gaps`: history, source ACLs/memberships and dynamic macro fidelity are explicitly qualified.
- Downloaded the ZIP from the app in Chrome. Independently verified all 24 content-file hashes/byte counts, all 25 checksum entries including the manifest, ZIP CRCs, preserved Unicode, and exact attachment equality with the uploaded fixture.
- Verified copy: ignored `artifacts/live-test/confluence-takeout-verified.zip`. This is local live proof of the narrow selected-page flow, not whole-space coverage or a production recovery point.
- Fixed the observed scoped-token native download route (`/rest/api/content/<page>/child/attachment/att<id>/download`) and preserved the `att` identifier. Authentication stays on the gateway and is stripped at the media redirect.

Current automated evidence: 37 tests across archive, connector and API, workspace typechecks, and an isolated Next.js production build. No credentials are written to repository files or this report.

The existing Fastify/Notion dashboard remains legacy code, not an archive release. Hosted MVP delivery is tracked in the GitHub repository; the original local snapshot had no Git metadata.
