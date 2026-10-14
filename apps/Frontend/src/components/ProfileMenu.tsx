import { useState } from "react";
import { Link, useLocation } from "wouter";
import { usePortalSession } from "../lib/portal";

const ITEMS = [
  { section: "Rent a scooter", links: [
    { href: "/browse", label: "Discover" },
    { href: "/account/bookings", label: "My bookings" },
    { href: "/account/active-rental", label: "Active rental" },
  ] },
  { section: "Account", links: [
    { href: "/account/wallet", label: "Wallet" },
    { href: "/account/support", label: "Support" },
    { href: "/account/profile", label: "Riders & profile" },
  ] },
];

export function ProfileMenu() {
  const { session, logout } = usePortalSession("user");
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  if (!session) {
    return (
      <Link
        href="/login"
        className="h-9 px-4 rounded-full border border-line-strong text-sm font-medium text-ink hover:bg-surface-3 transition-colors flex items-center"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full bg-ink text-surface flex items-center justify-center"
        aria-label="Account menu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.5 20c1.5-4 5-6 7.5-6s6 2 7.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute right-0 top-11 z-50 w-56 bg-surface rounded-panel border border-line shadow-[0_12px_32px_rgba(18,22,26,0.14)] py-2">
            {ITEMS.map((group) => (
              <div key={group.section} className="px-3 py-1.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-3 px-1 mb-1">{group.section}</p>
                {group.links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-row px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            ))}
            <div className="border-t border-line mt-1 pt-1 px-3">
              <button
                type="button"
                onClick={() => {
                  logout();
                  setOpen(false);
                  navigate("/");
                }}
                className="w-full text-left rounded-row px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
