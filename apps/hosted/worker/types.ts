import type { SecurityEnv } from "./security"
export interface Env extends SecurityEnv {
  DATABASE_URL: string;
  ASSETS: Fetcher;
  ARCHIVES: R2Bucket;
  CAPTURE: Workflow<{ captureId: string }>;
  USER_RATE: RateLimit;
  EDGE_RATE: RateLimit;
  RELEASE: string;
}
