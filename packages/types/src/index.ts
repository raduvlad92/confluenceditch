// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "owner" | "client"
export type Provider = "google" | "github"
export type ConnectionStatus = "active" | "expired" | "revoked"
export type MigrationStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled"
export type PageMappingStatus =
  | "pending"
  | "converting"
  | "pushing"
  | "done"
  | "failed"
  | "skipped"
export type LogLevel = "info" | "warn" | "error"

// ─── API response envelope ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: { page: number; limit: number; total: number }
}

export interface ApiError {
  error: { code: string; message: string }
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  role: UserRole
  createdAt: string
}

// ─── Connections ──────────────────────────────────────────────────────────────

export interface ConfluenceConnection {
  id: string
  userId: string
  cloudId: string
  siteUrl: string
  siteName: string | null
  status: ConnectionStatus
  scopes: string[]
  createdAt: string
  updatedAt: string
}

export interface NotionConnection {
  id: string
  userId: string
  workspaceId: string
  workspaceName: string | null
  workspaceIcon: string | null
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
}

export interface ConfluenceSpace {
  key: string
  name: string
  type: string
  pageCount?: number
}

export interface NotionPage {
  id: string
  title: string
  type: "page" | "database"
}

// ─── Migrations ───────────────────────────────────────────────────────────────

export interface MigrationOptions {
  includeAttachments: boolean
  includePermissions: boolean
  dryRun: boolean
}

export interface Migration {
  id: string
  userId: string
  confluenceConnectionId: string
  notionConnectionId: string
  label: string
  status: MigrationStatus
  spaceKeys: string[]
  notionParentId: string
  options: MigrationOptions
  pagesTotal: number
  pagesDone: number
  pagesFailed: number
  bytesTotal: number
  bytesDone: number
  errorSummary: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateMigrationInput {
  confluenceConnectionId: string
  notionConnectionId: string
  label: string
  spaceKeys: string[]
  notionParentId: string
  options: MigrationOptions
}

export interface MigrationProgress {
  id: string
  status: MigrationStatus
  pagesTotal: number
  pagesDone: number
  pagesFailed: number
  bytesTotal: number
  bytesDone: number
}

// ─── Page Mappings ────────────────────────────────────────────────────────────

export interface PageMapping {
  id: string
  migrationId: string
  confluencePageId: string
  confluenceSpaceKey: string
  confluenceTitle: string | null
  confluenceParentId: string | null
  notionPageId: string | null
  notionParentId: string | null
  status: PageMappingStatus
  errorMessage: string | null
  retryCount: number
  attachmentCount: number
  attachmentsDone: number
  createdAt: string
  updatedAt: string
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

export interface MigrationLog {
  id: string
  migrationId: string
  pageMappingId: string | null
  level: LogLevel
  message: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  totalMigrations: number
  totalPagesMigrated: number
  activeMigrations: number
  failureRate: number
}

// ─── BullMQ Job Payloads ──────────────────────────────────────────────────────

export interface OrchestratorJobData {
  migrationId: string
}

export interface PagePullJobData {
  migrationId: string
  pageMappingId: string
  confluencePageId: string
  cloudId: string
  userId: string
}

export interface PageConvertJobData {
  migrationId: string
  pageMappingId: string
  confluencePageId: string
  rawHtml: string
  title: string
  labels: string[]
}

export interface PagePushJobData {
  migrationId: string
  pageMappingId: string
  confluencePageId: string
  title: string
  blocks: unknown[]
  userId: string
  retryForParent?: boolean
}

export interface AttachmentPullJobData {
  migrationId: string
  pageMappingId: string
  attachmentId: string
  attachmentUrl: string
  filename: string
  mimeType: string
  cloudId: string
  userId: string
}
