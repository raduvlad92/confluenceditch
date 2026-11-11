# Hosted MVP

The deployed target is `apps/hosted`: the existing React takeout UI bundled as static assets with Vite, served by one Cloudflare Worker. It does not deploy the legacy Next/Fastify/Notion dashboard. This avoids an unnecessary server-rendering adapter for the export interface.

The owner chose Clerk, open registration, a public GitHub repository and `confluenceditch.deletecookies.dev` on 2026-11-11. This overrides the PRD's proposed Better Auth component for the MVP. The new Clerk application uses **secondary application** domain mode: `clerk.confluenceditch.deletecookies.dev` and `accounts.confluenceditch.deletecookies.dev`. Its DNS does not replace root-domain or other apps' authentication records. Email sign-in is enabled; social sign-in is outside this initial setup.

## Data and access

- Clerk session signatures, expiry, issuer, authorized party, subject and session ID are verified on every API request. The Worker uses this app's public verification key and has no Clerk account-management secret.
- Each connection and capture belongs to one Clerk user. Database composite foreign keys preserve that ownership. No standing public archive URLs exist; previews and downloads require the current user's short-lived Clerk token and a fresh ownership/expiry/revocation check.
- A dedicated Neon Postgres project in Frankfurt records encrypted connections, capture state, selections, generations and immutable artifact references. No direct AWS account is used; Neon's underlying region is `aws-eu-central-1` as allowed by PRD assumption A01.
- API tokens are encrypted with AES-GCM, bound to user and connection IDs, using a Worker secret held outside the database. No credentials or captured source content belong in Git.
- Private EU-jurisdiction R2 stores source files, readable output and ZIPs. A Workflow contains only the capture ID; it retrieves the bounded selection, verifies the archive, stores it, then publishes with a generation check. Interrupted attempts may repeat source reads; they cannot overwrite or publish a stale attempt.
- Closing or refreshing the browser does not stop the job. The database command is saved before Workflow creation; retrying the same command or reading its queued status repairs a missed Workflow launch.
- Disconnect immediately revokes downloads, clears stored source credentials and fences pending work. Connection/export access expires 24 hours after connection. Hourly cleanup purges revoked content; a two-day R2 object lifecycle is a fallback for interrupted attempts. Provider operational backups have their own retention policies.

## Tested envelope and cost limits

This is a bounded current-page export MVP, not the full R1/R2 release or a recovery product. Limits remain 20 selected current published pages, 1 MiB per attachment, 2 MiB total attachment bytes and 2 MiB retained source API response bytes. History, comments, source permissions/memberships and live documents remain declared gaps. Format 0.3 records hosted source mode; older archives remain independently verifiable.

Each account gets one active capture and five commands per rolling 24 hours. The application has a shared 30-command rolling daily limit, enforced in a serialized database transaction. API rate limits and Worker CPU limits bound individual requests. These reduce operating cost; they are not a provider-wide monetary spending cap.

## Build and deployment

```sh
pnpm install --frozen-lockfile
pnpm check:hosted
pnpm deploy:hosted
```

GitHub Actions are disabled for this repository. Cloudflare Builds is configured for `main`, with dependency/build caching and branch previews disabled. Build command: `pnpm check:hosted`. Deploy command: `pnpm deploy:hosted`. No GitHub schedules, matrix jobs, browser-test jobs or duplicate deploy jobs are needed. Cloudflare itself still meters build/runtime/storage usage under the account's plan.

Runtime secrets: `DATABASE_URL`, `CREDENTIAL_KEY`. Public configuration and the public Clerk verification key are in `apps/hosted/wrangler.jsonc`. The Clerk frontend publishable key is public by design. Production data is never loaded into branch previews.

Apply the checked-in migration with `pnpm --filter @confluenceditch/hosted exec tsx scripts/migrate.ts /absolute/path/to/ignored-environment.json`. It uses a direct Neon endpoint and refuses to invent connection credentials. Validate schema changes on a separate Neon branch before production. Local account-boundary integration tests use the ignored `.env.hosted-check.json`; they skip when that isolated environment is absent. Unit tests require no provider credentials.

When rotating the Clerk signing key, refresh the public PEM in the Worker configuration. Preserve the credential encryption key across deploys; rotating it requires re-encryption or reconnecting existing connections.

## Deployment evidence (2026-11-11)

- Public source: https://github.com/raduvlad92/confluenceditch. Repository-level GitHub Actions is disabled.
- All five Clerk DNS records verified under the application subdomain. Open registration and email-code signup/sign-in were completed in external Chrome. Password creation is optional.
- The live app created Workflow `f0ebef84-5906-4fc8-934e-08c07a5397ea`, which completed a synthetic three-page/one-attachment export. Its authenticated browser download passed independent ZIP CRC, manifest membership and every checksum check.
- Unauthenticated API access returns HTTP 401. Automated tests separately proved wrong-issuer/other-app rejection, account isolation, idempotency, quota enforcement and disconnect revocation on an isolated Neon branch.
- Cloudflare Builds is connected to `main`, with `pnpm check:hosted` then `pnpm deploy:hosted`, Node 22 and build caching enabled. Preview-branch builds are explicitly off. The first automatic build is verified separately from this configuration readback.
