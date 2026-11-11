/** Synthetic source responses. This fetcher has no network fallback. */
export const demoFetch: typeof fetch = async input => {
  const url = new URL(String(input))
  const space = { id: "100", key: "ENG", name: "Engineering", type: "global" }
  const contents = [
    { id: "101", title: "Engineering handbook", body: '<p>This is a small sample of the archive you can create from your own Confluence site.</p><h2>Getting started</h2><p>Good documentation helps the next person find their way. Keep the context, the decisions, and the files together.</p><ul><li>Read the onboarding checklist</li><li>Find the owner of each service</li><li>Keep a local copy of the essentials</li></ul><h2>The three things we keep</h2><table><tr><th>Content</th><th>In your archive</th></tr><tr><td>Pages</td><td>Readable Markdown</td></tr><tr><td>Files</td><td>Real attachment bytes</td></tr><tr><td>Source</td><td>Original API responses</td></tr></table><p><ac:link><ri:page ri:content-id="102"/><ac:plain-text-link-body><![CDATA[Open the onboarding checklist]]></ac:plain-text-link-body></ac:link></p>' },
    { id: "102", title: "Onboarding checklist", body: '<p>A good first week starts with a short, useful checklist.</p><ac:task-list><ac:task><ac:task-status>complete</ac:task-status><ac:task-body>Meet your team</ac:task-body></ac:task><ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>Run the project locally</ac:task-body></ac:task><ac:task><ac:task-status>incomplete</ac:task-status><ac:task-body>Read the release runbook</ac:task-body></ac:task></ac:task-list><h2>Questions to ask</h2><blockquote><p>What would have helped you on your first day?</p></blockquote><p>Write down the answer. Someone else will need it.</p>' },
    { id: "103", title: "Release runbook", body: '<p>Keep releases small, visible, and easy to recover.</p><h2>Before the release</h2><ol><li>Review the change and its test results</li><li>Confirm the responsible person</li><li>Write down the recovery steps</li></ol><ac:structured-macro ac:name="code"><ac:parameter ac:name="language">sh</ac:parameter><ac:plain-text-body><![CDATA[pnpm test\npnpm build\n]]></ac:plain-text-body></ac:structured-macro><h2>Release notes</h2><p><ac:link><ri:attachment ri:filename="release-notes.txt"/><ac:plain-text-link-body><![CDATA[Open the release notes]]></ac:plain-text-link-body></ac:link></p><ac:structured-macro ac:name="status"><ac:parameter ac:name="title">Ready for review</ac:parameter></ac:structured-macro>' },
  ]
  const page = (item: typeof contents[number]) => ({ id: item.id, title: item.title, spaceId: "100", status: "current", parentId: item.id === "101" ? null : "101", parentType: "page", authorId: "sample-author", ownerId: "sample-owner", version: { number: 1, authorId: "sample-author", createdAt: "2026-11-01T09:00:00Z" }, body: { storage: { value: item.body } } })
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } })
  if (url.pathname === "/wiki/rest/api/user/current") return json({ accountId: "sample-account", displayName: "Sample workspace" })
  if (url.pathname === "/wiki/api/v2/spaces") return json({ results: [space], _links: {} })
  if (url.pathname === "/wiki/api/v2/spaces/100") return json(space)
  if (url.pathname === "/wiki/api/v2/spaces/100/pages") return json({ results: contents.map(page), _links: {} })
  const selected = contents.find(item => url.pathname === `/wiki/api/v2/pages/${item.id}`)
  if (selected) return json(page(selected))
  if (/\/pages\/\d+\/attachments$/.test(url.pathname)) return json({ results: url.pathname.includes("/103/") ? [{ id: "att104", pageId: "103", title: "release-notes.txt", status: "current", mediaType: "text/plain", fileSize: new TextEncoder().encode("Release 1: keep your knowledge.\n").byteLength, downloadLink: "/wiki/download/attachments/103/release-notes.txt?version=1", version: { number: 1 } }] : [], _links: {} })
  if (url.pathname === "/wiki/download/attachments/103/release-notes.txt") return new Response("Release 1: keep your knowledge.\n", { headers: { "content-type": "text/plain" } })
  return new Response("", { status: 404 })
}
