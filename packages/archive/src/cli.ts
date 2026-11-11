import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { buildArchive } from "./build"
import { LIMITS } from "./contract"
import { verifyArchive } from "./verify"

async function loadDirectory(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  let totalBytes = 0
  let visitedEntries = 0
  const walk = async (directory: string, prefix: string) => {
    if (prefix.split("/").length > 20) throw new Error("Archive directory depth exceeds P0 limits")
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Expected a directory, without symbolic links")
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visitedEntries > LIMITS.files * 2) throw new Error("Archive directory entries exceed P0 limits")
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isSymbolicLink()) throw new Error("Symbolic links are not permitted in an archive")
      if (entry.isDirectory()) await walk(join(directory, entry.name), path)
      else if (entry.isFile()) {
        const file = join(directory, entry.name)
        const info = await lstat(file)
        totalBytes += info.size
        if (totalBytes > LIMITS.bytes || files.size >= LIMITS.files) throw new Error("Archive exceeds P0 verification limits")
        files.set(path, new Uint8Array(await readFile(file)))
      } else throw new Error("Special files are not permitted in an archive")
    }
  }
  await walk(root, "")
  return files
}

async function main() {
  const [command, source, destination, ...extra] = process.argv.slice(2)
  if (extra.length || !source || !["build", "verify"].includes(command) || (command === "build" ? !destination : Boolean(destination))) {
    throw new Error("Usage: archive build <normalized-fixture.json> <new-output-directory> | archive verify <archive-directory>")
  }
  if (command === "verify") {
    const verification = await verifyArchive(await loadDirectory(resolve(source)))
    if (!verification.ok) throw new Error(`Verification failed: ${verification.errors.join("; ")}`)
    console.log(`Integrity and declared local references verified (${verification.verifiedFiles} content files). Source completeness and rendered usability are not established by this check.`)
    return
  }
  const sourcePath = resolve(source)
  const info = await lstat(sourcePath)
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.inputBytes) throw new Error("Expected a regular fixture file up to 8 MiB")
  const archive = await buildArchive(JSON.parse(await readFile(sourcePath, "utf8")))
  const output = resolve(destination)
  try { await lstat(output); throw new Error("Output already exists; choose a new directory") }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  await mkdir(dirname(output), { recursive: true })
  const staging = await mkdtemp(join(dirname(output), ".confluenceditch-"))
  try {
    for (const [path, bytes] of archive.files) {
      const file = join(staging, ...path.split("/"))
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 })
    }
    const readBack = await verifyArchive(await loadDirectory(staging))
    if (!readBack.ok) throw new Error("Written archive failed read-back verification")
    // Reserve the name exclusively so a concurrent build cannot overwrite an archive.
    await mkdir(output, { mode: 0o700 })
    try { await rename(staging, output) }
    catch (error) { await rmdir(output); throw error }
  } finally { await rm(staging, { recursive: true, force: true }) }
  console.log(`Built synthetic P0 archive: ${archive.manifest.result}; ${archive.manifest.counts.capturedDocuments} current documents, ${archive.manifest.counts.capturedRevisions} revisions, ${archive.manifest.counts.assets} asset versions.`)
  console.log(output)
}

main().catch(error => {
  // Input validation can contain source data: print only a bounded operational error.
  console.error(error instanceof Error && error.name !== "ZodError" ? error.message.slice(0, 500) : "Archive input failed schema validation")
  process.exitCode = 1
})
