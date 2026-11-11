import Link from "next/link"

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/connections", label: "Connections" },
  { href: "/dashboard/migrations", label: "Migrations" },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r flex flex-col shrink-0">
        <div className="px-5 py-5 border-b">
          <Link href="/" className="font-bold text-lg text-brand-700">ConfluenceDitch</Link>
        </div>
        <nav className="flex-1 py-4 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors mb-1"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/auth/sign-out`}
            className="block text-center text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
