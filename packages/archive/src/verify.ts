import { LIMITS, manifestSchema, pathSchema, type ArchiveManifest } from "./contract"
import { compare, sha256 } from "./util"

export interface VerificationResult { ok: boolean; errors: string[]; verifiedFiles: number }

/** Offline structural/integrity verification. This is not a source-coverage attestation. */
export async function verifyArchive(files: ReadonlyMap<string, Uint8Array>): Promise<VerificationResult> {
  const errors: string[] = []
  let verifiedFiles = 0
  const result = () => ({ ok: errors.length === 0, errors, verifiedFiles })
  if (files.size > LIMITS.files || [...files.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0) > LIMITS.bytes) {
    errors.push("Archive exceeds P0 verification limits"); return result()
  }
  for (const path of files.keys()) if (!pathSchema.safeParse(path).success) errors.push("Unsafe file path")
  let manifest: ArchiveManifest
  try { manifest = manifestSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files.get("manifest.json")))) }
  catch { errors.push("Missing or invalid manifest"); return result() }
  const expected = new Set(["manifest.json", "checksums.sha256"])
  const foldedPaths = new Set(["manifest.json", "checksums.sha256"])
  const checksums: string[] = []
  for (const entry of manifest.files) {
    if (foldedPaths.has(entry.path.toLowerCase())) { errors.push(`Duplicate or reserved manifest path: ${entry.path}`); continue }
    foldedPaths.add(entry.path.toLowerCase())
    expected.add(entry.path)
    const bytes = files.get(entry.path)
    if (!bytes) { errors.push(`Missing file: ${entry.path}`); continue }
    const actualHash = await sha256(bytes)
    if (bytes.byteLength !== entry.bytes || actualHash !== entry.sha256) errors.push(`Integrity mismatch: ${entry.path}`)
    else verifiedFiles++
    checksums.push(`${entry.sha256}  ${entry.path}`)
  }
  for (const path of files.keys()) if (!expected.has(path)) errors.push(`Unlisted file: ${path}`)
  for (const path of ["README.md", "index.md", "reports/coverage.md", "reports/access.md", "reports/findings.json"]) {
    if (!expected.has(path) || !files.has(path)) errors.push(`Missing required archive file: ${path}`)
  }
  for (const reference of manifest.localReferences) {
    if (!expected.has(reference.from) || !files.has(reference.from) || !expected.has(reference.to) || !files.has(reference.to)) {
      errors.push("Local reference points outside archive membership")
    }
    if (reference.fragment && !manifest.anchors[reference.to]?.includes(reference.fragment)) errors.push("Unresolved local anchor")
  }
  for (const [path, anchors] of Object.entries(manifest.anchors)) {
    const bytes = files.get(path)
    if (!expected.has(path) || !bytes) { errors.push("Anchor map points outside archive membership"); continue }
    const markdown = new TextDecoder().decode(bytes)
    if (new Set(anchors).size !== anchors.length || anchors.some(anchor => !markdown.includes(`<a id="${anchor}"></a>`))) errors.push("Missing or duplicate declared anchor")
  }
  checksums.push(`${await sha256(files.get("manifest.json")!)}  manifest.json`)
  if (new TextDecoder().decode(files.get("checksums.sha256")) !== checksums.sort(compare).join("\n") + "\n") errors.push("Missing or inconsistent checksum listing")
  return result()
}
