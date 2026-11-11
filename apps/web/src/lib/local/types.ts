export interface LocalSpace { id: string; key: string; name: string; type?: string }
export interface LocalPage { id: string; title: string; spaceId: string; status: string; subtype?: string | null; version?: { number: number } }
export interface LocalConnection { mode: "live" | "demo"; siteUrl: string; displayName: string; expiresAt: string }
export interface ArchiveDocument { path: string; title: string; sourceKey: string; revision: string; authorRef: string | null; sourceUrl: string; findings: number }
export interface LocalFinding { code: string; severity: "info" | "warning" | "error"; sourceKey: string | null; revisionId: string | null; message: string; originalPath: string | null }
export interface LocalCapture {
  id: string; status: "queued" | "running" | "ready" | "ready_with_gaps" | "failed" | "cancelled";
  phase: "retrieving" | "converting" | "verifying"; pagesDone: number; pagesFailed: number; pagesTotal: number; assetsDone: number;
  createdAt: string; error: string | null;
  result?: {
    documents: ArchiveDocument[]; findings: LocalFinding[];
    files: { path: string; bytes: number; sha256: string; mediaType: string }[];
    anchors: Record<string, string[]>; sourceMode: string;
    capabilities: Record<string, { status: string; reason: string | null }>;
  }
}
export interface LocalSession { enabled: boolean; connection: LocalConnection | null; capture: LocalCapture | null }
