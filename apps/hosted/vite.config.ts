import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "pk_live_"+Buffer.from("clerk.confluenceditch.deletecookies.dev$").toString("base64").replace(/=/g,"")) },
  resolve: { alias: { "@": fileURLToPath(new URL("../web/src", import.meta.url)) } },
  build: { outDir: "dist", sourcemap: false },
})
