# Test a direct Confluence export

Run `pnpm dev:takeout` and open **http://localhost:3000 in external Chrome**. The server binds only to loopback. The direct connector must be explicitly enabled by this script; it is disabled in an ordinary build/deployment.

1. Connect using your `https://<site>.atlassian.net` URL, Atlassian email and API token. **Try sample** exercises the same capture path against synthetic source responses.
2. Choose a space, including a personal space if desired. Select 1–20 published pages. Page/space lists paginate; search filters the loaded page list. Live documents are shown but cannot be selected.
3. Choose whether to include current attachments and create the takeout. Refreshing the browser resumes its progress page while this local server remains running.
4. Inspect page preview, raw Markdown, coverage and files. Download the ZIP and open its `index.md` locally. Files and source responses are real bytes, not expiring links.

The archive includes all its original source material. Anyone receiving it can read every included file. The export only sends GET requests to Confluence. The local app never writes source pages or permissions. Synthetic test content may be seeded separately by the authorized operator.

## Local scope and limits

- Current published pages from one explicitly selected space; up to 20 selected page IDs per run.
- Current attachments: up to 1 MiB each and 2 MiB combined. Oversized/unavailable assets are retained as declared gaps, not silently counted as captured.
- Up to 2 MiB total raw API responses, 8 MiB normalized archive input and 32 MiB generated files. Exceeding a hard archive limit blocks that output; select fewer pages or exclude attachments.
- History, comments, groups, permission rules and identity profiles are not collected. Source-supplied creator/owner/editor IDs are retained. Uncollected labels and unknown identity fields remain `null`.
- Scoped API tokens use the Atlassian gateway, with cloud ID discovery restricted to the chosen site. The selected four granular read scopes are `read:space:confluence`, `read:page:confluence`, `read:attachment:confluence` and `read:user:confluence`. If the legacy current-user endpoint rejects the scopes, v2 space access validates the connection and the acquisition principal remains unknown rather than inferred from an email.
- Credentials and a maximum of three takeouts per session stay in server memory for at most two hours, until disconnect, or until server restart. They are not written to a database or `.env`. This is not durable retention, a background job service or production organization authorization.
- Sessions use random HttpOnly/SameSite cookies. Requests are loopback-only and mutations require same-origin browser requests. Guessed resource IDs, cross-session access and downloads after disconnect are rejected.

## Checks

`pnpm test` runs archive, connector and local API tests. `pnpm typecheck` checks all workspace packages. Build independently of the dev server with `NEXT_BUILD_DIR=.next-check pnpm --filter @confluenceditch/web build`.

The source adapter has fixtures for scoped tokens, pagination, denied content, drift, binary mismatch, bounded reads, redirect credential stripping and cancellation. API tests cover idempotent commands, changed-payload conflicts, session isolation, immediate download revocation, cross-origin writes and late-task cancellation. The Markdown fixture suite includes layout-section/cell separation after a real-source regression.

A live account capture, downloaded ZIP checksum verification and human review remain distinct from these local checks. Live run evidence is recorded in `docs/implementation.md` without credentials or customer document bodies.
