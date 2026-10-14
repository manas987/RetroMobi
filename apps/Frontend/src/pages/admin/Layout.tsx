import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { usePortalSession } from "../../lib/portal";

const NAV = [
  { href: "/admin", label: "Overview", roles: ["SUPPORT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/tickets", label: "Support", roles: ["SUPPORT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/merchant-review", label: "Merchant review", roles: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/vehicle-review", label: "Vehicle review", roles: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/booking-ops", label: "Booking ops", roles: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/payments", label: "Payments", roles: ["SUPER_ADMIN"] },
  { href: "/admin/audit", label: "Audit", roles: ["SUPER_ADMIN"] },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, logout } = usePortalSession("admin");
  const [path, navigate] = useLocation();

  useEffect(() => {
    if (!session) navigate("/admin/login");
  }, [session, navigate]);

  if (!session) return null;
  const role = session.role ?? "SUPPORT";

  return (
    <div className="min-h-screen flex bg-surface-2">
      <aside className="w-60 shrink-0 bg-ink text-white flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-white/10 font-semibold">
          retromobi <span className="ml-1.5 text-xs font-normal text-white/50">control room</span>
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 p-3">
          {NAV.filter((n) => n.roles.includes(role)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-row px-3 py-2 text-sm ${path === n.href ? "bg-white/15 font-medium" : "text-white/70 hover:bg-white/10"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-2 text-xs text-white/40">Signed in as {role}</div>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/admin/login");
          }}
          className="m-3 h-9 rounded-row border border-white/20 text-sm text-white/80 hover:bg-white/10"
        >
          Sign out
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
