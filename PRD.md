# ConfluenceDitch Product Requirements Draft

Version: 1.0  
Updated: 2026-11-11  
Status: Draft for product review  
Product owner: Project owner  
Audience: Product, design, engineering, operations and pilot customers

ConfluenceDitch gives organizations a readable, versioned and independently usable takeout of their Confluence knowledge. Customers can preserve their documentation before selecting a replacement, use eligible Markdown with AI tools, retain recurring captures, and later deliver the same archive to supported documentation systems.

The primary customer artifact is Markdown with real attachment files, available source revisions, authorship, identity and permission records, preserved originals, navigation and a coverage report. Cloudflare provides application infrastructure and archive storage; Neon provides the database. A destination account is never required to create a takeout.

This document defines the full product and its release sequence. Items marked **Agreed** come from the product direction. Items marked **Proposed** are working defaults or targets requiring validation. A release requirement describes a delivery gate, not an existing capability.

## 1 Product decisions

| Decision                | Status         | Requirement                                                                                                                                                                                                           |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source focus            | Agreed         | Start with Confluence. Preserve a path to other source adapters without expanding the first release.                                                                                                                  |
| Product purpose         | Agreed         | Support takeout, backup, AI use and later migration. Customers may continue using Confluence.                                                                                                                         |
| Primary readable format | Agreed         | Markdown files that remain useful outside this service.                                                                                                                                                               |
| History                 | Agreed         | Preserve retrievable source revisions and record changes collected by later captures.                                                                                                                                 |
| People and access       | Agreed         | Preserve creators, owners, revision authors, identities, memberships and permission evidence.                                                                                                                         |
| Destinations            | Agreed         | Support a growing set of destinations, including Slite, Google Docs and Notion. Availability is declared per adapter.                                                                                                 |
| Infrastructure          | Agreed         | Prefer Cloudflare for application compute, files, jobs and operations; use Neon for the database.                                                                                                                     |
| AWS preference          | Assumption A01 | Avoid direct AWS services and an AWS account. Neon currently creates new projects in AWS regions; strict avoidance of all AWS infrastructure would require changing the database choice. Resolve before provisioning. |
| First source edition    | Proposed       | Confluence Cloud first. Data Center and Server require separate tested source adapters.                                                                                                                               |
| Initial access mode     | Proposed       | Organization owners explicitly authorized to acquire the selected content receive privileged archive access. Shared readers and AI access ship behind a separate authorization gate.                                  |
| Initial business model  | Proposed       | Paid assisted takeouts, followed by self-service takeouts and recurring retention plans. Prices and limits are validated through pilots.                                                                              |

Neon's region distinction is documented in its [region reference](https://neon.com/docs/introduction/regions). This infrastructure preference does not change the open archive format.

## 2 Problem and value

An organization can have years of knowledge in Confluence while being unsure where to move it. Exporting documents alone does not establish that files, links, revisions, authorship or access rules survived. A migration can appear successful while omitting content, widening access or leaving documents dependent on the old system.

ConfluenceDitch separates preservation from destination selection. The customer receives an archive they can inspect and keep, together with evidence of what was captured and what remains incomplete. Future converters and delivery adapters can operate on preserved source material without requiring another Confluence connection.

Native exporters and Markdown tools already exist. The value hypothesis is a usable archive without scripts, transparent coverage, supported recovery and a dependable path to later use. The product must demonstrate that advantage through accepted customer archives rather than claim that Markdown export itself is unique.

The public promise is: **Own a usable copy of your Confluence knowledge and decide where it goes later.** Marketing must qualify supported scope and available history. It must not advertise universal migration fidelity, perfect backups, unlimited pages or fixed completion times without evidence.

## 3 Customers and jobs

### Primary customers

- An IT or operations owner preparing to decommission or consolidate Confluence but not yet committed to a destination.
- A documentation owner who needs an independent, usable record with files, history and access evidence.
- An organization preparing an approved AI knowledge project and needing structured documents with provenance and controlled access.
- A consultant delivering a bounded preservation or migration project for a client.

### Jobs to be done

1. Preserve the selected knowledge before a renewal, organizational change or decommissioning event.
2. Verify what was collected before relying on an archive or removing source access.
3. Read documents and open their files without a Confluence account or this service.
4. Inspect a document's earlier revisions and identify who created or changed it.
5. Understand the captured access rules and their limitations.
6. Recover an earlier captured document or collection after later source changes.
7. Prepare authorized current documents for a new system or AI tool.
8. Move a verified collection into a supported destination with explicit handling of incompatible features.

The first buyers should have an active preservation, AI preparation or migration event. General interest in future flexibility is a discovery hypothesis, not evidence of purchase intent.

## 4 Product scope and release sequence

The full scope includes capture, portable archives, source history, authorship, permission evidence, recurring protection, governed access, AI integrations and multiple destinations. Release boundaries sequence this scope; they do not remove it.

| Release                  | Customer outcome                                                 | Required gate                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 Engineering proof     | No public availability                                           | Prove platform compatibility, source retrieval, archive contract and recovery on representative fixtures.                                                            |
| R1 Assisted pilot        | A reviewed takeout of an agreed scope                            | Deliver Markdown, local assets, originals and coverage/access reports; include available history and metadata, declaring gaps. Operator assistance is explicit.      |
| R2 Public takeout        | A customer can connect, create, inspect and download a takeout   | Self-service capture with authorship, identities, permission evidence and retrievable history; secure owner access; payments; tested limits; automated verification. |
| R3a Recurring protection | A customer can retain and recover successive captures            | Scheduling, retention, alerts, incremental capture, deletion safeguards, capture comparisons and portable Git history export.                                        |
| R3b Governed access      | Authorized people and AI clients can retrieve a permitted subset | Current archive authorization, revocation, permission-aware search and scoped API/MCP access. Ship independently from R3a if needed.                                 |
| R4 Destination delivery  | A customer can move an archive into a supported tool             | Per-destination capability declaration, identity/access mapping, sample approval, resumable delivery and read-back verification.                                     |

Import packages may precede direct API integrations. Select the first direct adapter through paid demand and benchmark evidence. The existing Notion prototype does not determine product positioning or adapter priority.

### First release exclusions

These capabilities are outside R2 unless a published capability row and acceptance suite establish support:

- Native disaster restoration into Confluence.
- Complete extraction of every Confluence object type or third-party application's data.
- Full historical permission reconstruction where the source supplies only current rules.
- Automatic permission equivalence across arbitrary destinations.
- Shared document access based solely on archived source ACLs.
- Bidirectional synchronization or editing Confluence from this product.
- AI rewriting, summarization, embeddings or a hosted answer bot.
- Publicly shared archives, enterprise SSO, customer-managed encryption keys and customer-owned storage connections.

These are release limits, with future work retained where applicable. Read-only capture must never modify or delete source content.

## 5 Product language

| Term                       | Meaning                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Source revision            | A version of one source object with its source identity, available content, author and source timestamp.                                    |
| Capture                    | A bounded collection run with a declared scope and observation interval. It does not imply an atomic historical state of the entire site.   |
| Archive                    | Preserved source material and its independently readable, versioned representation, with metadata and coverage evidence.                    |
| Output                     | A generated package or delivery produced from a retained capture using a named profile and converter version.                               |
| Source permission evidence | Observed source rules, identities, memberships and inheritance used to explain source access.                                               |
| Archive entitlement        | The current authorization to access an archive through this service. It is separate from source permission evidence.                        |
| Coverage                   | How observed acquisition results compare with the selected scope and the evidence available to establish that scope.                        |
| Verification               | Checks of inventory reconciliation, artifact integrity, conversion findings, links and offline usability.                                   |
| Recovery point             | A sealed capture eligible for dependable recovery after the required technical checks pass. It does not require a customer to click Accept. |
| Recovery                   | Retrieval of retained content or restoration of this service. Native restoration into a destination is a separate capability.               |

The project glossary uses these meanings. The interface should use familiar labels such as **Create takeout**, **Captures**, **History**, **Coverage report** and **Download archive**.

## 6 User experience

### Journey A Create a takeout

1. Sign in and create or select an organization.
2. Connect Confluence through a guided read-only authorization flow. Explain requested access and the source identity used for acquisition.
3. List observable global and personal spaces with selection, search and loading/error states. Do not make a selected single connection appear empty.
4. Choose specific spaces or **All accessible spaces**, history mode, and published content scope. The site-wide option is shown only when its supported inventory authority has been established.
5. Run a preflight. Show estimated pages, revisions and file volume; available permission access; unsupported objects; expected qualifications; price; retention; and the consequences of downloading a full archive.
6. Select **Create takeout**. Navigate to a resumable run page immediately after durable creation.
7. Show stages and unique-item counts, source throttling or reauthorization needs, and actionable failures. Leaving the browser must not interrupt capture.
8. Review the coverage, conversion and access reports. Open representative pages and files before relying on the result.
9. Download the archive. Offer a simple current-content package and the full archive with history and sensitive metadata as distinct choices.
10. Optionally disconnect the source, delete hosted copies, or later enable recurring captures.

### Journey B Import a supplied export

The customer uploads a supported Confluence export package. The product inspects its actual contents before quoting coverage. It preserves the original package and identifies missing source history, ACLs, identities or attachments. An upload cannot acquire capabilities its supplied data does not contain. A file named backup or full export is not proof of site completeness.

### Journey C Use recurring protection

Choose cadence, scope and retention. Show the next run and the last verified recovery point. After each run, show additions, changes, confirmed deletions, unconfirmed absences, access changes and remaining gaps. A failed or partial run does not replace that recovery point or silently reduce retention. The customer can select a capture, inspect its report and download it. Successful recurring runs become recovery points automatically after technical verification; customer sign-off is not required for each run.

### Journey D Use an archive later

Choose a supported output profile or destination. Preview feature mappings, identity matches, permission differences and expected exclusions. Approve a representative sample before a bulk write. After delivery, reconcile source objects to destination objects and inspect read-back results. The preserved archive remains available if delivery fails or the destination is changed.

### Journey E Recover from interruption

When credentials expire, a quota is reached or a task fails, explain the reason and the next action. Reauthorization or retry resumes compatible checkpoints. Pause, resume and cancel have visible states. Restarting or retrying must not double-charge, duplicate artifacts or report a partial result as complete.

### Screens

R2 requires organization setup, source connections, scope/preflight, capture progress, capture list/detail, document preview/history, coverage/access reports, downloads, billing and retention/deletion settings. R3 adds schedules, comparisons and recovery selection. R4 adds destination connections, mapping, sample review and delivery reports.

The interface must work with keyboard navigation, visible focus, accessible status announcements and narrow screens. A customer must not need Git, a terminal, API tokens or knowledge of storage infrastructure to create and inspect a takeout.

## 7 Source coverage contract

Support is declared for each source adapter, source edition and capability. R2 targets Confluence Cloud published pages and blog posts, their retrievable revisions, attachment bytes and versions, and the identity/access evidence needed for the selected scope. Each capability requires a live retrieval proof before it is advertised.

| Object or capability                      | Target treatment                                                                                                                      | Release handling                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Global and personal spaces                | Preserve stable IDs, names, creator/owner fields where supplied, hierarchy and space permissions                                      | R2 target; include both in inventory tests.                                                                     |
| Published pages and blog posts            | Current body, source metadata, labels, links, creator, owner and revision author                                                      | R2 target.                                                                                                      |
| Source revisions                          | Every discoverable and retrievable revision in the chosen history scope, including available body, author, timestamp and edit message | R2 target; missing revisions explicitly recorded.                                                               |
| Attachments and images                    | Binary content, identity, filename, media type, size, hash and available version metadata                                             | R2 target; historical references must identify asset-version fidelity.                                          |
| Comments                                  | Separately identified threads/records with author, timestamp and anchors where retrievable                                            | Preserve supplied records in R1; full API capture requires a separate capability gate and is targeted after R2. |
| Users and groups                          | Referenced stable identities, available profile/status fields and relevant membership evidence                                        | R2 target; unavailable personal fields are not invented.                                                        |
| Permissions and restrictions              | Native rules, restriction state, space/context references, observed memberships and public access settings where exposed              | R2 target; capture gaps qualify coverage.                                                                       |
| Folders and hierarchy                     | Structural identity, parent relationships and applicable restrictions where exposed                                                   | R2 target for supported traversal; never silently flatten unknown containers.                                   |
| Archived or trashed material              | Inventory/capture where supported and explicitly selected                                                                             | Separate scope options; no current-only scan may claim these were captured.                                     |
| Drafts and live documents                 | Distinct source types and history semantics                                                                                           | Unsupported until tested; available metadata/originals may be retained with that status.                        |
| Whiteboards and databases                 | Preserve supported inventory/originals where available                                                                                | No Markdown fidelity or full-content claim until an adapter proves it.                                          |
| Templates, custom content and app objects | Type-specific inventory and source references                                                                                         | Explicit capability rows; unsupported types remain visible in the report.                                       |
| Dynamic macros and diagrams               | Preserve source parameters/body, referenced files and an available render                                                             | Conversion fallback or unsupported rendering is explicit.                                                       |
| Jira and external embedded systems        | Preserve references and available embedded artifacts                                                                                  | Acquiring external content/history requires a separate authorized source adapter.                               |
| Data Center and Server                    | Separate source adapters and version matrix                                                                                           | Future release; Cloud support does not imply support here.                                                      |

Every requested entity or capability has an acquisition status: `captured`, `partial`, `inaccessible`, `unavailable`, `unsupported`, `excluded`, `failed` or `unknown`. Record a reason, source reference and observation time. A conversion has a separate status: `native`, `fallback` or `unconverted`, with structured findings.

An undiscovered object cannot be listed as captured or unavailable. Reports must distinguish known gaps from coverage the source identity cannot establish. A 404 alone does not prove deletion. A missing group listing does not mean a group has no members. No restrictions returned does not establish public access.

Native export formats have different coverage. Atlassian's [export guidance](https://support.atlassian.com/confluence-cloud/docs/export-content-to-word-pdf-html-and-xml) describes format-dependent exclusions. XML exports lose vendor support on December 1, 2026, while CSV is the supported alternative; uploaded format support must be selected from real samples rather than hard-coded around XML. [Export support change](https://support.atlassian.com/confluence/kb/xml-export-end-of-life-confluence-cloud/)

## 8 Functional requirements

### FR01 Organization isolation

Every connection, capture, identity snapshot, object reference, output, schedule and entitlement belongs to an organization. The API checks organization ownership and the required privilege before returning records, previews, reports or downloads. An operator's knowledge of another organization's IDs cannot expose its data.

Acceptance: cross-organization requests, guessed IDs, reused download grants and queue payload tampering fail without disclosing content or sensitive metadata. Billing access alone never grants document access.

Product administration and archive privileges are separate. In R1 and R2, the same person normally holds the initial owner and archive-administrator grants, so setup remains simple; the authorization model must not assume those roles are equivalent.

| Role or grant         | Authority                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization owner    | Manage organization membership, owner succession and billing. Content access requires an explicit archive grant.                                                                   |
| Archive administrator | Acquire the authorized scope, read its sensitive reports/originals/history, create full exports, recover and delete the granted archive scope. Assignment and changes are audited. |
| Billing manager       | Manage purchases and invoices without reading documents, source credentials or sensitive access reports.                                                                           |
| Source connector      | Authorize a source identity for an organization; this does not grant every organization member access to the acquired archive.                                                     |
| Reader or AI client   | Future scoped retrieval grant under R3b; never implicit full-export or administration privilege.                                                                                   |
| Support operator      | No standing content authority. A customer-authorized, time-limited incident grant is separately recorded and revoked.                                                              |

Initial setup records the organization owner's source authorization and explicit archive-administrator grant for the selected scope. Organization owners control role assignment; granting archive access requires an existing authorized administrator for that archive or a documented ownership-recovery process. Ownership transfer identifies the successor and separately transfers or retains archive grants. Removing a member revokes their product sessions, API grants and archive access; it does not change historical authorship.

Prevent accidental removal of the last organization owner. Recovery requires an audited ownership-verification procedure through established recovery channels; a billing role, a matching display name or an original source-creator field cannot alone establish archive authority. Test owner transfer, last-owner loss, billing-only access and expiry of support grants before shared administration ships.

### FR02 Secure source connection

Use the product's distributable Atlassian OAuth integration with the minimum read capabilities required for the selected features. Bind random, expiring, single-use state to the initiating organization and user/session. Validate callbacks, serialize refresh-token rotation, encrypt credentials and support explicit disconnection. Reauthorization must not silently attach a source to a different organization.

Acceptance: forged, expired and replayed state fail; concurrent token refresh does not strand the connection; revoked access blocks acquisition with an actionable state. Source content is unchanged by the workflow. Public distribution and actual granted scopes are verified with a customer-like account.

### FR03 Inventory and scope

Exhaust supported pagination, identify source namespaces, preserve container relationships and record the exact selection. Explain inaccessible and unsupported scope before acceptance where discoverable. Preflight estimates carry an uncertainty indicator when histories or bytes are not yet enumerated.

Acceptance: multiple sites with the same page ID, personal spaces, duplicate titles, empty selections, archived selections and missing parents are handled without collisions or misleading completion.

### FR04 History selection

Offer **All retrievable revisions** as the proposed default and **Current content only** as an explicit scoped option. Preserve the chosen mode in the manifest and interface. If retrieval exceeds the approved allowance, pause for an authorized scope/quota decision; never silently reduce history.

Acceptance: paginated histories reconcile to archived records and explicit gaps. No current body is substituted for an unavailable historical body. Unknown authors remain unknown.

### FR05 Preserve originals and assets

Retain original uploaded packages or retrieved source payloads and attachment bytes independently of conversion. Record hashes and source provenance. Store large content in private object storage, with durable references and upload verification.

Acceptance: a converter failure leaves originals available for retry; interrupted downloads resume or restart safely; checksum mismatches block successful verification. No package consists only of expiring URLs or Git LFS pointers.

### FR06 Produce portable Markdown

Generate one current Markdown document per eligible source object and readable Markdown for each retained historical revision. Use stable paths and a documented format profile. Conversion must not silently discard, summarize, invent or truncate meaningful source content.

Acceptance: fixtures preserve long text/code, Unicode, whitespace where meaningful, CDATA, nested lists, task states, links and inline media. Unsupported constructs have readable fallbacks where possible and findings linked to preserved originals.

### FR07 Resolve structure and links

Inventory document and asset identities before rendering links. Preserve hierarchy in metadata and generated navigation. Resolve local page, asset and anchor references through a mapping; retain out-of-scope or inaccessible targets as explicitly unresolved source references.

Acceptance: renames and moves preserve canonical paths; duplicate/non-ASCII headings produce stable unique anchors; every declared local target exists or is listed as unresolved. An inaccessible parent is never silently replaced by the root.

### FR08 Preserve authorship and access evidence

Capture source creator, designated owner, last editor and revision author as separate fields where supplied. Retain source permission rules, membership evidence and observation times. Use stable principal IDs; names and emails are labels. Preserve raw evidence alongside normalized records.

Acceptance: an author is not automatically granted access; missing metadata is explicit; rule and membership changes appear in capture comparisons even when content is unchanged. Permission gaps qualify the access report.

### FR09 Verify and report coverage

Reconcile discovered entities, requested capabilities, archived records and referenced bytes. Verify manifests, checksums, links, conversion findings and representative offline rendering. Record the source observation interval and detected changes during collection.

Acceptance: every known requested entity is accounted for; an empty failed source cannot become a green successful archive; all declared artifact hashes verify. Customer acceptance of an exception is recorded without rewriting the original result as gap-free.

### FR10 Browse and compare

Provide navigation, text search over the authorized archive scope, document preview, source metadata and available historical revisions. Display conversion findings and references to originals. R3 adds capture comparisons distinguishing content, access and metadata changes.

Acceptance: preview, search snippets, titles, counts, attachment URLs and history observe the same current archive authorization as full content. Preview does not execute uploaded scripts or active source HTML.

### FR11 Download independently usable packages

Provide a current-content package and a full archive. The full archive includes available history, originals and access evidence and is a privileged export. Generate files in parts when necessary, with a root manifest mapping every part.

Acceptance: an authorized customer extracts and reads the package on a network-disabled machine; files open locally; each part is independently integrity-checkable. A fresh authorized download can be obtained after a link expires without another source capture.

### FR12 Resume and retry safely

Persist checkpoints for inventory pages, source revisions, asset transfers, conversion, verification and packaging. Retry bounded tasks using stable identities. Count unique entities rather than attempts. Repeated requests and duplicate queue deliveries must converge on one logical result.

Acceptance: forced worker interruption, duplicate deliveries and repeated customer clicks create no missing or duplicate artifacts, duplicate purchases or inflated counts. Pause and resume preserve work across every stage.

### FR13 Cancel and disconnect

Cancel stops new acquisition and output publication, while safely accounting for in-flight work. Disconnect immediately prevents new source requests and purges source credentials. Retained archives follow the separately disclosed retention policy.

Acceptance: cancelled or deleted captures cannot be resurrected by a late message. Disconnecting a source never claims to erase already downloaded files or automatically rewrites archive ownership.

### FR14 Retain successive captures

R3a stores immutable capture manifests and reuses retained bytes where safe. A later capture does not mutate an accepted earlier capture. A source item missing from a scan is recorded as unconfirmed absence until deletion is established.

Acceptance: deleted or newly restricted source material remains recoverable within the retained authorized archive scope. Partial captures do not replace the latest verified recovery point.

### FR15 Schedule and alert

R3a supports an explicit cadence, timezone, next-run time, retention and missed-run policy. Prevent overlapping capture of the same configured scope. Alert on failure, prolonged blockage, stale verified recovery points and approaching retention or quota boundaries.

Acceptance: duplicate scheduler delivery produces one run; missed runs are visible; alerts link to an authorized action without including document content. Proposed default missed-run behavior is one catch-up run, not an unbounded backlog.

### FR16 Recover retained content

Recover a selected retained page/revision or capture as a new output without mutating previous evidence. Show its source revision and capture interval. Restoring into Confluence or another destination requires that destination's separately supported delivery contract.

Acceptance: recovery succeeds after source disconnection, within the retained scope, and can be validated offline.

### FR17 Export portable Git history

R3a generates a self-contained repository or bundle from retained capture manifests. Commits describe capture runs; source revision authors and timestamps remain provenance. Historical per-page revisions stay readable without fabricating historical whole-site snapshots.

Acceptance: a customer can inspect the exported history without this service or a Git hosting account. Exported current pages agree with the selected capture; attachment bytes needed by retained exported versions are available.

### FR18 Govern human and AI access

R3b provides scoped archive access governed by current archive entitlements. Search and retrieval filter eligible documents, snippets, historical records and files before returning content to a reader or model. Unknown access is not allowed by default.

Acceptance: revocation prevents subsequent authorized retrieval across current and historical content within the documented freshness target. Source disconnection switches to the explicitly selected archive policy; it never implies continued live source-permission synchronization.

### FR19 Deliver to documentation systems

R4 uses independent output runs with adapter-specific mappings, checkpoints and reports. Each destination declares support for text, structure, media, links, comments, authorship, history and permissions. Map stable source identities to verified destination identities. Incompatible access rules block affected delivery or require an authorized, recorded exception in private staging.

Acceptance: approve a representative sample before bulk writing; retry without duplicates; read back created objects; reconcile every selected source object to a result. Preserve the archive when a destination fails.

Default delivery creates new objects in verified private staging. Adapters must not overwrite, move or delete unrelated pre-existing destination content. Record every created destination object and its relationship to the output run. On failure or cancellation, stop new writes and retain the private partial result with a disposition report. Offer resume or explicitly authorized cleanup limited to this run's created objects; an adapter that cannot safely clean up must say so. A later update-in-place mode requires a separate conflict and rollback contract.

### FR20 Enforce entitlements and show cost

Validate capture, storage, revision and output allowances before and during work. Show the price and estimated allowance use before a charge. Scope changes or unexpected volume require an explicit new allowance decision.

Acceptance: concurrent requests cannot bypass limits; payment webhooks are idempotent; cancellation/refund rules are visible; a billing failure does not immediately destroy retained customer data.

### FR21 Audit sensitive actions

Record source connection/disconnection, capture changes, full exports, access grants, policy overrides, recovery and deletion with actor, organization, action, subject, time and result. Keep credentials and document bodies out of audit records and operational logs.

Acceptance: authorized owners can review the action history; operators cannot use logs as a route to content or secrets.

### FR22 Delete hosted data predictably

Show which captures, originals, histories, generated outputs, identity/ACL records and recovery copies will expire or be removed. Revoke service access immediately on an authorized deletion request, stop related work and report physical deletion progress and retention constraints.

Acceptance: no new download grants are issued after deletion starts; late jobs cannot repopulate data; tenant-scoped shared bytes remain only while another retained authorized capture references them.

## 9 Archive format

### Format contract

Publish a versioned archive specification. A reader must be able to understand the archive without the application database. Markdown is the primary usable representation; original payloads provide fidelity evidence and allow improved future conversions. Documented metadata is plain JSON or YAML.

The archive identifies its format version, source adapter version, converter version, Markdown profile, capture ID and interval, namespace mapping, selected scope, hashes and coverage. These versions are independent of source page revision numbers.

Example layout:

```text
archive/
  README.md
  index.md
  manifest.json
  checksums.sha256
  reports/
    coverage.md
    access.md
    findings.json
  sites/<site-key>/
    spaces/<space-id>/index.md
    pages/<page-id>.md
    history/pages/<page-id>/<revision-key>.md
    assets/<asset-id>/<revision-or-hash>/<safe-filename>
    metadata/pages/<page-id>.json
    access/spaces/<space-id>.json
    access/pages/<page-id>.json
    identities/principals.json
    identities/memberships.json
    originals/
```

A source key includes provider, source namespace and object type. Do not identify a page by title, path or a bare page ID across multiple sites. Filenames are safe on case-insensitive filesystems and Windows; preserve original names in metadata.

### Markdown profile

Proposed profile `confluence-takeout-markdown-1` uses CommonMark core with documented GFM tables, task lists and strikethrough. Use ordinary relative links rather than proprietary wiki links by default. Declare supported HTML fallbacks; readers that cannot render them receive a simpler profile with explicit findings. Document deterministic heading-anchor generation and the tested reader set.

Preserve headings, paragraphs, links, code language, long code/text, list hierarchy, checkbox state, quotations, basic tables and inline assets. Merged/nested tables, layouts, macros and diagrams require readable fallbacks and originals. Unknown macros retain available bodies/parameters rather than being replaced solely by a placeholder. Dynamic behavior is not reproduced by static Markdown.

No LLM is required for capture or faithful conversion. Optional AI rewriting creates a separate derived output with its own provenance and never replaces preserved evidence.

### Metadata example

The following fields illustrate the contract; the published schema is finalized during P0:

```yaml
source_key: confluence:site-a:page:12345
title: Deployment handbook
space_id: "67890"
parent_source_key: confluence:site-a:page:12000
source_url: https://example.atlassian.net/wiki/spaces/ENG/pages/12345
source_revision: "17"
source_modified_at: "2026-11-10T09:30:00Z"
creator_ref: confluence:site-a:user:creator-id
owner_ref: confluence:site-a:user:owner-id
revision_author_ref: confluence:site-a:user:editor-id
policy_ref: ../access/pages/12345.json
```

Capture timestamps belong in manifests and observation records, not every unchanged Markdown file. Identical source input, profile and converter version must produce identical normalized document bytes irrespective of worker ordering.

### Verification outputs

The coverage report records requested and observed counts by object/capability, identity of the acquisition principal, known gaps, unknown inventory authority, failures and exclusions. The access report explains observed rules, inheritance, memberships, evaluation limits and public exposure. Findings carry object/revision references, severity, cause, fallback and suggested action.

The manifest is authoritative for package membership and integrity. It does not claim that a checksum establishes source completeness. Local links to missing targets must be listed; an unresolved source URL is not counted as a working offline link.

The default current-content package and future AI index include one eligible current revision per selected document. Histories, originals and retired/superseded content are outside that default index. Full archive exports remain available to the explicitly authorized archive owner.

## 10 History and consistency

Store these concepts independently:

- Source object identity and source revision identifier/number.
- Source creation/modification time and available author/owner references.
- Capture ID, start/end time and per-object observation time.
- Permission and membership observation times.
- Converter, source adapter, archive schema and output profile versions.

Atlassian exposes per-object version collections and version-specific retrieval capabilities; availability remains subject to source permissions and APIs. [Version API](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/)

A capture is collected over an interval. Pin retrieved revisions where supported, record each actual revision, and detect/reconcile source changes during the run. Unresolved drift produces a qualified result. Do not reconstruct a fictitious historical global snapshot from unrelated per-page revision timelines.

Preserve retrievable historical attachment bytes and their references. If an older document can only be associated with an uncertain asset version, record that limitation rather than rendering the latest asset as historically correct.

Deleting or renumbering source revisions must not overwrite previously retained evidence. Preserve the observed revision label plus content hash and observation context; a later conflicting observation is a new record. Confirmed source deletion and unconfirmed absence are separate events.

An improved converter produces a new output run from retained originals. It must not rewrite a sealed capture or change the recorded source revision.

## 11 Authorship and permission model

### Evidence to preserve

Preserve creator, designated owner, last editor, revision author and available timestamps as separate provenance fields for spaces and content. Preserve deactivated, deleted, redacted and unresolved principal states. Do not infer an owner from the last editor or grant a creator permanent access.

Capture relevant space rules, content restriction state, direct permissions, ancestor relationships, membership evidence, public/anonymous access and other available access prerequisites. Preserve native operation names alongside documented normalized actions such as view, edit/update, comment, create, add attachment, delete and manage restrictions. Do not collapse all actions into a single role.

Confluence distinguishes space permissions from direct content restrictions; parent view restrictions inherit while edit restrictions behave differently. Its page-permissions endpoint returns direct permissions, so it is not a complete effective-access list. [Restriction semantics](https://support.atlassian.com/confluence-cloud/docs/add-or-remove-page-restrictions), [content permission API](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-content-permissions/), [space permission API](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-space-permissions/)

### Effective access evidence

An evaluated decision records principal, action, resource, `allowed`, `denied` or `unknown`, supporting policy references, membership snapshot, evaluator version and observation time. Only emit a known result when the required inputs and supported semantics are present. Incomplete group membership or policy capture cannot become an unrestricted result.

An old content revision retrieved with today's permissions establishes neither its historical readers nor historical access grants. Historical ACLs remain unknown unless retained policy observations or source audit/history establish them. Permission changes and membership changes are versioned even if document content is unchanged.

### Current archive authority

R1 and R2 use owner-controlled privileged archive access. The owner is authorized for the selected acquisition and explicitly accepts the sensitivity of full archives. Organization membership, billing access or connecting a source does not automatically grant every user archive access.

R3b introduces explicit archive grants or a separately verified source-synchronized mode. Current archive authorization governs historical content too. Proposed revocation target is 60 seconds for subsequent service reads; validate session/cache behavior before claiming it. Historical grants are audit evidence, not current entitlement.

After disconnection, source permissions are no longer live. The selected archive policy and its freshness state must be visible. Unknown or stale source-synchronized access fails closed. Owners may continue to access retained archives under the explicitly established archive policy.

### Portable evidence and destination enforcement

A full ZIP or Git bundle gives its recipient access to all included content and history. ACL files do not enforce per-page restrictions on a recipient's machine, and already downloaded content cannot be recalled. The export action must explain this and require the specific full-export privilege.

Destination delivery maps identities, memberships, roles and operations to tested destination capabilities. Never silently broaden access. If native author/history fields cannot be set, preserve the original values as metadata and report that distinction. Recorded exceptions do not relabel approximate mapping as exact equivalence.

AI access must authorize before selecting chunks, attachments, snippets or historical content. No instruction inside a document or metadata file may grant access or instruct the ingestion service to take actions.

## 12 Capture and output lifecycle

Capture state and capture phase are separate. Proposed states are `draft`, `queued`, `running`, `pausing`, `paused`, `blocked`, `cancelling`, `cancelled`, `verifying`, `completed`, `completed_with_gaps` and `failed`. Active phases identify inventory, retrieval, normalization and reconciliation. A blocked state carries a reason and permitted recovery action.

Normal progression is draft, queued, running, verifying, then completed or completed with gaps. A requested pause acknowledges after a safe checkpoint. Resume returns compatible work to the queue under the same capture identity. Cancellation and deletion invalidate work generations so late tasks cannot publish results.

Output state is independent: `requested`, `queued`, `generating`, `verifying`, `ready`, `ready_with_gaps`, `failed`, `cancelled`, `expired` or `deleting`. A capture can support several outputs without another source read. A destination failure cannot change source evidence.

Deletion has its own states: `requested`, `access_revoked`, `purging`, `retained_until`, `completed` or `failed`. Report a retention lock or operational recovery copy as pending physical deletion, not as already erased.

Progress derives from unique source entities and terminal outcomes. Keep acquisition, conversion and verification counts separate. Show unknown totals as estimates. Logs and per-item rows refresh with totals and support pagination, filters and actionable errors.

An empty selection is blocked before work. A confirmed empty authorized scope is a distinct empty result. Failed or unknown inventory cannot produce an apparently complete zero-item archive.

Technical completion and customer acceptance are different events. A run becomes a recovery point automatically only when its declared requested scope has reconciled, required bytes and metadata verify, and no unresolved acquisition gaps or unknown inventory authority affect that scope. Documented conversion fallbacks can pass the declared profile while remaining visible findings. Qualified captures remain retained and downloadable as qualified results but do not silently advance the latest verified recovery point. An owner can select one for recovery without removing its qualifications.

Customer acceptance records whether a delivered project met the customer's agreed needs. It is useful for commercial validation and does not control job completion, retention start time or recurring backup freshness.

## 13 System architecture

### Components

| Component             | Proposed system                                                       | Responsibility                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Web application       | Existing React and Tailwind UI on Cloudflare Workers                  | Guided setup, archive browsing, progress and account settings. Test the supported Next.js deployment path before retaining a specific adapter. |
| Application API       | Cloudflare Workers with Hono                                          | Authentication, organization authorization, commands, scoped reads and authorized downloads. Reuse compatible domain logic.                    |
| Authentication        | Existing Better Auth integrated with Neon                             | Customer identities and sessions. Source OAuth and destination OAuth remain separate connections.                                              |
| Database              | Neon                                                                  | Authoritative ownership, entitlements, capture state, checkpoints, policy references and output records.                                       |
| Database access       | One supported Workers connection path, proposed Hyperdrive            | Use a compatible driver/Prisma adapter and pinned versions. Avoid stacking Hyperdrive with the Neon serverless driver.                         |
| Capture coordination  | Cloudflare Workflows                                                  | Durable orchestration and bounded steps, with Neon owning the product lifecycle.                                                               |
| Parallel tasks        | Cloudflare Queues                                                     | Page/revision/asset tasks containing IDs and object references rather than document bodies.                                                    |
| Object storage        | Private Cloudflare R2                                                 | Immutable originals, Markdown, assets, manifests and generated packages.                                                                       |
| Scheduling            | Cron Triggers into Workflows                                          | Recurring capture initiation, overlap prevention and missed-run handling.                                                                      |
| Heavy exports         | Cloudflare Containers where benchmarks justify them                   | Git executable/filesystem tasks and packages exceeding Workers budgets. Scratch storage is disposable.                                         |
| Operations and builds | Workers Observability and Workers Builds                              | Structured logs, deployment validation, errors and overdue/failed capture alerts.                                                              |
| Billing               | Proposed Stripe Checkout and verified webhooks                        | Takeout purchases and recurring plan entitlements. Pilot invoicing may be manual.                                                              |
| Email                 | Cloudflare Email Service if account availability and delivery qualify | Transactional completion/failure and account notifications. Its beta status is a launch dependency; existing Resend is a fallback candidate.   |

Cloudflare documents [Neon connection options](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/) and [Next.js deployment paths](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/). Pin the actual tested combination. Keep permission/session reads fresh rather than relying on a stale query cache.

### Storage and job invariants

Neon records the truth about an operation; R2 holds durable bytes; Workflows and Queues coordinate execution. Losing a queue message must not lose customer content or the only record of pending work. Durable checkpoints and a reconciler reconstruct incomplete tasks.

Objects use organization-scoped immutable keys and content hashes. Deduplication must not expose cross-organization existence or mix retention permissions. Seal a capture only after referenced objects, counts and hashes reconcile. Interrupted object writes and database commits are repaired without publishing a false complete result.

Use small idempotent tasks and bounded batches. Record source-specific throttling, respect provider retry instructions, handle authorization failures distinctly and bound retries. Workflow steps and queue payloads contain references, not whole large archives. Benchmark against current [Workflow limits](https://developers.cloudflare.com/workflows/reference/limits/) and [Queue limits](https://developers.cloudflare.com/queues/platform/limits/); split work before reaching those limits.

R2 object keys and manifests implement archive history explicitly. Bucket retention locks can protect retained bytes but do not replace source history, restore testing or a deletion policy. [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)

### Platform portability

Cloudflare bindings stay behind application interfaces. The archive format must not require Workers, R2, Neon or a proprietary reader. Application infrastructure may be platform-specific; customer-owned artifacts remain ordinary files with documented schemas.

## 14 Domain records and API boundaries

The implementation must represent these concepts separately rather than extend a migration record that requires a Notion destination:

| Record                                 | Essential responsibility                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Organization and member                | Current product ownership and privileges.                                                |
| Source connection                      | Source namespace, acquisition identity, capabilities and encrypted credential reference. |
| Capture and scope                      | Selected capabilities, history mode, limits, observation interval, status and coverage.  |
| Source object and revision             | Stable identity, native revision, provenance and original/body references.               |
| Asset and asset revision               | Binary identity, source version, hash, media type, bytes and storage reference.          |
| Principal and membership observation   | Source identity/status and observed group relationships.                                 |
| Policy observation and access decision | Native rules, normalized references, observation time and evaluated evidence.            |
| Capture item and checkpoint            | Per-item acquisition/conversion/verification progress and retry reconciliation.          |
| Manifest and finding                   | Sealed membership/integrity declaration and explicit exceptions.                         |
| Output run and delivery mapping        | Profile, converter/adapter version, generated paths or destination IDs and checkpoints.  |
| Schedule and retention policy          | Cadence, timezone, missed-run behavior, retained scope and expiry.                       |
| Purchase and entitlement               | Idempotent payment state and approved usage allowances.                                  |
| Audit event and deletion request       | Sensitive actions and data-removal accounting.                                           |

API groups cover organization access, connections/capabilities, scope/preflight, captures/commands/progress, documents/history, reports, authorized outputs/downloads, schedules, billing and deletion. R3b adds scoped read/search/API clients; R4 adds destination profiles and delivery commands.

Creation and command endpoints require idempotency keys where repetition could create work or charges. Paginated lists expose stable cursors and total certainty. Serialize API records through explicit response types, including large counters and timestamps; do not return raw database objects.

## 15 Retention and recovery

Proposed R2 default hosted retention is 30 days from capture completion, disclosed before purchase. Customer sign-off does not delay that clock. Pilot retention is agreed explicitly. Proposed R3a default is daily capture with a 30-day window measured from each completed capture, subject to storage/history allowance. Retain the last verified recovery point until a successor qualifies or a separately disclosed maximum grace period expires; proposed grace is seven additional days with advance warning and a visible stale-backup alert. These defaults require cost and customer validation.

Retention applies to originals, revisions, assets, metadata, permission evidence, outputs, incomplete work, logs and operational recovery copies. Generated packages may expire before the preserved capture; regeneration remains possible while required source objects are retained. Proposed incomplete-run retention is seven days unless an active recovery case extends it.

Deleting a source item is not an instruction to erase previous captures. A customer may request deletion of retained archive content separately. State how this interacts with security, access revocation and previously downloaded packages.

Physical deletion of primary artifacts is proposed within seven days of an authorized request when no disclosed lock applies. Operational recovery copies expire within a proposed maximum of 30 days. Validate these promises against implemented storage and backup behavior before public launch. Do not enable irreversible retention behavior silently.

Operational recovery must restore the service's database, retained object references, encryption configuration and manifests consistently. Proposed internal targets are RPO at most 24 hours and RTO at most eight hours, subject to a demonstrated restore drill. These are service recovery targets, distinct from the customer's chosen source capture cadence.

A restore must not undo a deletion or revive revoked access. Preserve deletion tombstones and revocation generations in a protected replay record independent of the database restore point. Restore into a closed maintenance state, apply the latest trusted deletion/revocation record, re-enforce expiry and reconcile objects before enabling reads or jobs. If that record is unavailable, fail closed. Test recovery from a backup taken before a deletion and revocation; neither content publication nor entitlement may reappear.

Maintain a tested recovery copy strategy within the approved provider constraints and record its failure domains. A single provider account with deletion rights is not an independent backup. Separate-account protection, locks and customer downloads require an explicit operating decision before selling recurring protection.

## 16 Security and privacy requirements

- Enforce organization and resource authorization server-side on every content-bearing route, job command and download grant.
- Keep storage private. Downloads use a revocation-aware application gateway and short-lived grants; proposed grant lifetime is five minutes. A grant alone is insufficient: every new request, including a resumed range request, checks current identity, archive entitlement, deletion state and grant generation. Do not expose an unrevocable direct object URL where it would contradict the access guarantee. Deletion prevents new reads immediately; governed grant revocation meets the separately stated freshness target. Attempt to stop in-flight streams, but do not promise to recall bytes already delivered.
- Treat full archives and identity/ACL reports as sensitive privileged exports. Audit access and prevent unprivileged members from obtaining raw originals or history through indirect URLs.
- Keep provider secrets encrypted with a rotation and recovery procedure; keep encryption keys outside captured customer content. Never put credentials in exported metadata.
- Validate OAuth state and sessions, protect mutations against CSRF, validate callback destinations and use secure cookie configuration on the production domain.
- Treat all source content and uploaded archives as untrusted data. Prevent archive traversal, decompression abuse, active HTML/script execution and uncontrolled external fetches. Restrict attachment redirects and network destinations to authorized source retrieval rules.
- Keep customer documents, titles where sensitive, email addresses, tokens and download credentials out of general operational logs and telemetry. Use opaque IDs and bounded redacted errors.
- Isolate production, previews and tests. Use synthetic or explicitly authorized fixtures for development; database branching does not authorize copying production documents into previews.
- Record selected regions and subprocessors before paid launch. No EU-only processing or regulatory-compliance claim is permitted solely because an R2 bucket or Neon database uses a European region.
- A support operator receives no standing document access by default. Any exceptional access is authorized, time-bounded and audited.

## 17 Proposed limits and service targets

The following are proposed engineering and pilot targets, not validated capacity or customer SLAs. The release must publish the actual tested envelope and enforce it before and during acquisition.

| Dimension                                | Assisted pilot target | Public takeout test target                                           |
| ---------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Current pages and blog posts per capture | Up to 200             | Up to 1,000                                                          |
| Total requested source revisions         | Up to 2,000           | Up to 10,000                                                         |
| Total attachment bytes                   | Up to 1 GiB           | Up to 10 GiB                                                         |
| Individual asset                         | Up to 100 MiB         | Up to 500 MiB, with resumable transfer proof                         |
| Concurrent captures per organization     | 1                     | 1 initially; larger limits require measurement                       |
| Maximum download package part            | Proposed 2 GiB        | Proposed 2 GiB; split larger collections and publish a root manifest |

An allowance is not permission to omit excess material. If discovery exceeds it, show a blocked run and offer an authorized larger allowance or an explicit scoped capture. Existing captured evidence remains accounted for.

Proposed operational acceptance targets:

- Dashboard/API p95 response within two seconds under the defined test load, excluding provider acquisition and long output generation; report cold-start results separately.
- Progress visible within ten seconds of a durable state change.
- Automatic reconciliation/resumption after a worker interruption within five minutes under normal capacity.
- No silent content loss, cross-organization exposure or undeclared access broadening in the release fixture suite and accepted pilots.
- Public beta availability target of 99.5 percent per month for the interactive service, measured separately from third-party source availability.
- Customer-facing completion estimates are based on measured workload classes. No fixed in-minutes promise before source history and file volume are known.

## 18 Commercial model and validation

The one-off takeout is priced against an understandable scope of current content, requested history, files and assistance. A recurring plan adds cadence, retained storage and recovery value. Avoid unlimited volume or support promises.

Proposed pilot experiment: a representative private sample of up to ten pages, then an assisted takeout at EUR 299 for the agreed pilot envelope and support boundary. This is a willingness-to-pay experiment, not an approved public price. Self-service bands, recurring fees, refund rules and retention entitlements are set after measured delivery and support costs.

Before a charge, show the selected scope, estimated/uncertain volume, supported capabilities, known gaps, price, retention and cancellation/refund conditions. A scope increase cannot silently increase a bill. Do not charge for presenting an empty result caused by failed authorization as a successful takeout.

Validation timebox proposal: interview ten qualified buyers, benchmark three representative collections against native/exporter alternatives, and seek two accepted paid pilots. Record why the customer paid, what free methods failed to solve, support hours, compute/storage cost and whether the customer can use the result independently.

Acquisition starts with teams already facing a preservation or migration event and consultants serving them. Publish customer-approved examples of coverage and repaired gaps. Outreach, customer contact, payments and public launch are separate execution tasks.

## 19 Metrics

The primary product outcome is an **accepted archive**: the authorized customer can download and use the agreed captured scope, has reviewed declared material gaps, and can identify the retained history and access evidence. Acceptance does not erase qualifications.

| Metric                     | Definition                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Activation                 | Qualified organization reaches preflight and creates a durable capture.                                                             |
| Accepted archive rate      | Accepted paid archives divided by paid capture projects, reported by scope and source mode.                                         |
| Coverage                   | Captured versus requested observed entities/capabilities, with unknown authority and exclusions shown separately.                   |
| Silent-loss incidents      | Confirmed meaningful omissions without a corresponding finding. Release target is zero.                                             |
| Offline usability          | Percentage of accepted fixture/pilot archives passing network-disabled inspection and asset checks.                                 |
| Time to usable archive     | Creation to verified output, segmented by volume, history, source throttling and operator intervention.                             |
| Support effort             | Human delivery/support hours per accepted project.                                                                                  |
| Unit economics             | Revenue less attributable acquisition, storage, packaging, provider and support cost.                                               |
| Backup freshness           | Time since the latest technically verified recovery point compared with the agreed cadence; qualified runs are reported separately. |
| Recovery success           | Successful verified recovery drills/requests divided by attempted recoveries.                                                       |
| Permission mapping quality | Exact, qualified, blocked and unknown outcomes per relevant operation and destination.                                              |

Collect events such as connection succeeded, preflight completed, capture created/blocked/completed, output verified/downloaded, archive accepted, schedule stale and deletion completed. Events use opaque IDs and counts, not customer document content. Public percentages require a sufficient, stated denominator.

## 20 Validation and release gates

### Required fixture suite

1. Unwrapped sibling elements, bold-first paragraphs, CDATA, mixed/nested lists, task lists, Unicode and text/code longer than 100,000 characters.
2. Duplicate titles and IDs across sites, page renames/moves, missing parents, unusual filenames and case-insensitive extraction.
3. Cross-space/source links, repeated/non-ASCII anchors, out-of-scope and inaccessible targets, inline images and deliberately broken references.
4. Reused attachments, identical filenames with different bytes, binary revisions, interrupted transfers and checksum mismatches.
5. Simple, merged, nested and ragged tables; supported macros; unsupported macros retaining bodies/parameters; diagrams and external embeds.
6. Paginated histories, out-of-order results, redacted/deactivated authors, unavailable revisions and source edits during acquisition.
7. Space and inherited view restrictions, distinct edit/comment capabilities, unknown memberships, denied policy retrieval and current rules attached to older content without fabricated historical ACLs.
8. Changed permissions with unchanged content, revoked archive access, disconnected sources, and authorized versus unauthorized history and file retrieval.
9. Duplicate messages, retries, simultaneous commands, token refresh contention, worker restart, pause/resume/cancel, failed queue delivery and interrupted database/object finalization.
10. Deletion during work, retention expiry, retained shared objects, lock/deletion conflicts, expired download grants and unopened preissued grants used after revocation/deletion.
11. Network-disabled extraction/readability, complete binary files, package-part reconciliation and reprocessing originals with a new converter.
12. A service restore from before a deletion/revocation that does not resurrect deleted publication or revoked access.
13. For each claimed destination, a real sample import/delivery and read-back test against the declared profile and limits, including cancellation and disposition of partial private staging.

### Pilot gate

Pass security, archive integrity and no-silent-loss fixtures for the offered scope. Demonstrate a representative live authorized acquisition or supported uploaded sample, produce the complete reports, and have an operator verify the deliverable. Label gaps before purchase and acceptance.

### Public takeout gate

Pass the complete R2 fixture scope, production authentication and OAuth flows, customer-like permission capture, live attachment/history retrieval, tested packaging limits, payment entitlement behavior, offline verification, deletion and service recovery. Eliminate every known high-severity path affecting the released workflow. Documentation and claims match actual capability.

### Recurring protection gate

Demonstrate repeated capture, missed/duplicate scheduling, retained history through deletion/restriction changes, no replacement by partial results, alerts, retention expiry and recovery from both service interruption and source disconnection.

### Governed access and adapter gates

Demonstrate authorization before retrieval, timely revocation, historical-content protection and policy freshness. Each destination passes identity/permission mapping, private staging, sample approval, idempotent retry and read-back reconciliation. Permission preservation as metadata must never be presented as native enforcement.

## 21 Existing code and implementation sequence

The workspace contains a Next.js UI, Fastify API, Better Auth, Prisma models, BullMQ/Redis workers and a target-specific Confluence-to-Notion converter. The target architecture introduces source captures independent of any destination and moves runtime/job/storage integration to Cloudflare and Neon.

The current migration model requires a Notion connection and parent. Raw source content is passed through queue payloads rather than preserved as an archive. Permission capture is not implemented. These paths cannot establish the archive contract.

Known code gates from the review must be repaired or removed from released paths: fragment conversion omitting content, raw BigInt response serialization, unbound OAuth state, unfinished attachments, unsafe retry/counter behavior, stranded parent/pause work, stale progress/error handling and production entrypoint mismatch. Fixing a legacy deployment component is unnecessary if the approved architecture removes it; preserving its defective behavior is not acceptable.

Recommended sequence:

1. Establish the archive schema, glossary, capability matrix, fixtures and P0 platform/source proofs.
2. Separate organization/source/capture/output records and implement private durable object storage and reliable acquisition.
3. Implement history, identities, permission evidence, deterministic Markdown, link mapping and automated verification.
4. Deliver reviewed R1 archives; measure coverage, customer value, limits and cost.
5. Complete R2 self-service security, UX, billing, retention and recovery gates.
6. Add independently gated recurring protection, Git exports and governed access.
7. Add destination packages and direct adapters driven by accepted customer projects.

No calendar completion commitment is established by this sequence. Estimate engineering after the P0 source/platform proofs and the first representative archive.

## 22 Risks and mitigations

| Risk                                                          | Product consequence                                    | Mitigation and release evidence                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Native exporters or free tools solve the buyer's problem      | Customers do not pay for another exporter              | Benchmark real collections and measure paid acceptance, repaired gaps and support value before broadening the roadmap.     |
| Source access cannot establish full scope                     | A misleading full-backup claim                         | Publish capability and authority evidence, distinguish unknown inventory, and qualify or block unsupported promises.       |
| Markdown cannot reproduce interactive or complex content      | Documents lose meaning during conversion               | Preserve exact retrieved originals, local assets, readable fallbacks and per-revision findings; require fidelity fixtures. |
| Historical content is mistaken for historical access evidence | Incorrect audit or disclosure decisions                | Keep content revision and policy/membership observation time separate; historical ACLs remain unknown without evidence.    |
| Permission mapping widens access                              | Sensitive documents reach an unintended audience       | Owner-only privileged export first; later enforce current archive grants and block incompatible destination delivery.      |
| Capture volume exceeds platform or plan budgets               | Interrupted work, unexpected cost or silent truncation | Preflight estimates, explicit allowances, bounded checkpoints, streaming and measured Containers escalation.               |
| Provider APIs or runtime compatibility change                 | Capture or deployment breaks                           | Pin tested adapters, retain contract fixtures, monitor vendor changes and regenerate outputs from retained originals.      |
| Retention locks contradict deletion promises                  | Hosted data remains longer than promised               | Resolve the retention contract before enabling locks and expose pending physical deletion accurately.                      |
| Database/object references diverge after interruption         | Incomplete or unrecoverable archives                   | Verify sealed manifests, reconcile writes and exercise a joint database/object restore drill.                              |
| A single account or provider fails destructively              | Loss of retained protection                            | Select a protected recovery-copy strategy within provider preferences and prove recovery before recurring-backup claims.   |
| Cloudflare preference is interpreted as no AWS underlay       | Neon choice conflicts with the owner's constraint      | Resolve A01 before provisioning; do not call Cloudflare plus Neon entirely AWS-free.                                       |

## 23 Decisions to resolve

| ID  | Decision                                                         | Proposed default or consequence                                                                                                         | Needed before                             |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| A01 | Does AWS avoidance include vendor infrastructure underneath Neon | Assume no direct AWS account/services; strict avoidance requires a different database provider                                          | Provisioning                              |
| A02 | Archive entitlement after source disconnection                   | Owner-controlled retained archive; no implied live source synchronization                                                               | Pilot agreement and access implementation |
| A03 | Exact source capability scope                                    | R2 targets published Cloud pages/blogs, available history/assets and identity/permission evidence; broader types require declared gates | Pilot scope and public claims             |
| A04 | Upload format support                                            | Select from real current HTML/CSV samples; preserve originals; never infer absent ACL/history                                           | Upload release                            |
| A05 | Frontend and ORM compatibility                                   | Retain UI/domain model and test supported Workers deployment plus compatible Prisma driver versions                                     | P0 implementation plan                    |
| A06 | Packaging runtime and limits                                     | Stream bounded outputs; use Containers when measured jobs require filesystem/Git or exceed Workers budgets                              | Capacity and Git export promises          |
| A07 | Prices and allowances                                            | EUR 299 assisted pilot is an experiment; self-service/recurring bands follow observed costs and demand                                  | Public checkout                           |
| A08 | Retention, deletion, locks and recovery copies                   | Proposed 30-day takeout retention, seven-day primary purge and 30-day recovery-copy expiry; validate and disclose                       | Paid launch; locks before activation      |
| A09 | Region and processing boundaries                                 | Select database/storage locations and document actual processing; no unverified residency promise                                       | Customer data launch                      |
| A10 | Email provider availability                                      | Prefer Cloudflare sending if qualified; validate fallback without changing the core archive architecture                                | Account recovery and public notifications |
| A11 | Source-synchronized reader freshness                             | Explicit mode with fail-closed stale/unknown policy; owner-only access ships first                                                      | R3b                                       |
| A12 | First direct destination                                         | Choose from paid demand and measured supported features; do not default to Notion because a prototype exists                            | R4 prioritization                         |

## 24 Definition of done

A release is done when its promised user journeys work end to end, its capability and coverage reports are accurate, artifacts remain independently usable, sensitive access is controlled, recovery/deletion work as described and the relevant acceptance gates pass on representative source data. Source inspection, local checks, deployed behavior, a live capture and customer acceptance are separate evidence.

The enduring product contract is a readable, versioned Markdown takeout with real files, provenance, access evidence and transparent coverage. Later hosting, conversion and destination choices must preserve that contract.
