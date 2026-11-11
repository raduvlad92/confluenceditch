import Link from "next/link"

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/migrations", label: "Migrations" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 bg-gray-900 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="font-bold text-white">ConfluenceDitch</span>
          <span className="ml-2 text-xs bg-red-500 text-white px-1.5 py-0.5 rounded font-medium">ADMIN</span>
        </div>
        <nav className="flex-1 py-4 px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors mb-1"
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-4 pt-4 border-t border-gray-800">
            <Link
              href="/dashboard"
              className="block px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Client view
            </Link>
          </div>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
