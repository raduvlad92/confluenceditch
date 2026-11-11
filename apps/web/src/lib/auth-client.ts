import { createAuthClient } from "better-auth/client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export const authClient = createAuthClient({
  baseURL: API_BASE,
})
