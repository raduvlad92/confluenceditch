import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ConfluenceDitch — Your Confluence takeout",
  description: "Keep a readable copy of your Confluence pages, files and source material.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
