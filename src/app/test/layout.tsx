/**
 * Test UI Layout — sidebar navigation between the three Track A agents.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/test",
    label: "Overview",
    icon: "🏠",
    description: "Agent test dashboard",
  },
  {
    href: "/test/pharma-check",
    label: "Pharma-Check",
    icon: "🔬",
    description: "Fake medicine detector",
  },
  {
    href: "/test/lingo-med",
    label: "Lingo-Med",
    icon: "📋",
    description: "Lab report simplifier",
  },
  {
    href: "/test/care-sync",
    label: "Care-Sync",
    icon: "💊",
    description: "Prescription parser",
  },
];

export default function TestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar ── */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <span className="text-2xl">🏥</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                Sehat-Agent AI
              </h1>
              <p className="text-xs text-gray-400">Track A — Test Console</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/test"
                ? pathname === "/test"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg no-underline transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <div>
                  <div
                    className={`text-sm font-medium ${isActive ? "text-blue-700" : "text-gray-800"}`}
                  >
                    {item.label}
                  </div>
                  <div className="text-xs text-gray-400">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700 font-medium mb-1">
              ⚠️ Assist, not Diagnose
            </p>
            <p className="text-xs text-amber-600 leading-relaxed">
              All responses include the mandatory disclaimer. This is a test
              environment using mock data.
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-8">{children}</div>
      </main>
    </div>
  );
}
