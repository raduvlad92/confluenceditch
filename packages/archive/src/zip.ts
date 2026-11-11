import { zipSync } from "fflate"
import type { BuiltArchive } from "./contract"
import { compare } from "./util"
import { verifyArchive } from "./verify"

export async function createArchiveZip(archive: BuiltArchive): Promise<Uint8Array> {
  const verified = await verifyArchive(archive.files)
  if (!verified.ok) throw new Error("Archive integrity failed before packaging")
  return zipSync(Object.fromEntries([...archive.files].sort(([a], [b]) => compare(a, b))), {
    level: 6, mtime: new Date(2000, 0, 1, 0, 0, 0),
  })
}
