"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
const ADMIN_LIKE = ["admin", "director", "headmaster", "assistant_headmaster"];
const ALL_NAV = [
  { href: "/dashboard", label: "Dashboard", roles: [...ADMIN_LIKE, "accountant"] },
  { href: "/students", label: "Enrollment", roles: ADMIN_LIKE },
  { href: "/attendance", label: "Attendance", roles: [...ADMIN_LIKE, "teacher"] },
  { href: "/grades", label: "Grades", roles: [...ADMIN_LIKE, "teacher"] },
  { href: "/report-card", label: "Report card", roles: [...ADMIN_LIKE, "teacher"] },
  { href: "/fees", label: "Fees", roles: [...ADMIN_LIKE, "accountant", "teacher"] },
  { href: "/fees-overview", label: "Fees overview", roles: ["admin", "director"] },
  { href: "/revenue-reports", label: "Revenue reports", roles: ["admin", "director", "accountant"] },
  { href: "/fees-owing", label: "Fee-owing students", roles: ["admin", "director", "teacher"] },
  { href: "/absentees", label: "Absentee list", roles: ["admin", "director", "teacher"] },
  { href: "/users", label: "Staff & parents", roles: ADMIN_LIKE },
  { href: "/parent", label: "My children", roles: ["parent"] },
];
export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [role, setRole] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    let active = true;
    async function loadRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (active && profile) setRole(profile.role);
    }
    loadRole();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  const nav = role ? ALL_NAV.filter((item) => item.roles.includes(role)) : [];
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex flex-col w-56 shrink-0 border-r border-stone-200 min-h-screen p-4 print:hidden">
        <div className="mb-8 px-2 flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Barima Duah Memorial School"
            className="h-9 w-9 object-contain shrink-0"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div>
            <p className="font-display text-lg font-semibold text-pine leading-tight">Barima Duah</p>
            <p className="text-[11px] text-stone-400 mt-0.5">Creche — JHS 3</p>
          </div>
        </div>
        <nav className="space-y-1 flex-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === href ? "bg-pine text-paper" : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="text-sm text-stone-400 hover:text-clay text-left px-3 py-2">
          Sign out
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="sm:hidden sticky top-0 z-30 bg-paper border-b border-stone-200 px-4 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="Barima Duah Memorial School"
            className="h-7 w-7 object-contain shrink-0"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <p className="font-display text-base font-semibold text-pine leading-tight">Barima Duah</p>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 -mr-1.5 text-stone-500"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden sticky top-[49px] z-20 bg-white border-b border-stone-200 px-3 py-2 print:hidden shadow-sm">
          <nav className="flex flex-col gap-1">
            {nav.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${
                  pathname === href ? "bg-pine text-paper" : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                {label}
              </Link>
            ))}
            <button
              onClick={signOut}
              className="text-left px-3 py-2 rounded-lg text-sm font-medium text-stone-400 hover:text-clay hover:bg-stone-100"
            >
              Sign out
            </button>
          </nav>
        </div>
      )}

      <div className="sm:hidden h-2 shrink-0" />
    </>
  );
}
