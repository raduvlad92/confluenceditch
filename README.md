# ConfluenceDitch

Create independently usable Confluence archives before choosing a destination. Product requirements live in [PRD.md](PRD.md); terminology is in [GLOSSARY.md](GLOSSARY.md).

The hosted MVP is at **https://confluenceditch.deletecookies.dev**. It uses a separate Clerk app, private R2 storage and durable background exports. See [hosted MVP operations](docs/hosted-mvp.md) for scope, retention and deployment.

The local app connects directly to Confluence Cloud, lets you select current published pages, previews the Markdown and coverage report, and downloads a ZIP with original API responses and local attachment bytes. It has no destination dependency.

```sh
pnpm install --frozen-lockfile
pnpm dev:takeout
```

Open **http://localhost:3000 in external Chrome**. Connect with your site URL, Atlassian email and API token, or choose **Try sample**. For a first live run, select a few published pages from one space. The app is a local test, not a hosted release: credentials and takeouts live in server memory for at most two hours and are cleared on disconnect/server restart. No database, Redis or Notion connection is required. See [local testing](docs/local-testing.md) for scope, limits and validation.

The portable archive builder can also run independently:

```sh
pnpm install --frozen-lockfile
pnpm archive:build packages/archive/fixtures/confluence-storage.json artifacts/p0-demo
pnpm archive:verify artifacts/p0-demo
pnpm test
pnpm typecheck
```

Choose a new output directory for each build; existing directories are never overwritten. Open the output's `index.md`, then inspect its coverage and access reports. The sample intentionally has gaps.

The CLI accepts normalized acquisition JSON, not native Confluence export packages. It has an 8 MiB input / 32 MiB output ceiling. Durable hosted captures and organization access are still pending. See the [implementation status](docs/implementation.md), [archive format](docs/archive-format.md) and [capability matrix](docs/capabilities.md).

The older dashboard and Fastify/BullMQ/Notion prototype remain in the repository; the new home-screen flow does not run them. The new portable archive core is in `packages/archive`, and the read-only source adapter is in `packages/confluence`.
