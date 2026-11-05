import { Link, useLocation } from "wouter";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { usePortalSession } from "../lib/portal";

const ITEMS = [
  { section: "Rent a scooter", links: [
    { href: "/browse", label: "Discover" },
    { href: "/account/bookings", label: "My bookings" },
  ] },
  { section: "Account", links: [
    { href: "/account/support", label: "Support" },
    { href: "/account/profile", label: "Riders & profile" },
  ] },
];

export function ProfileMenu({ overlay = false }: {
  /** Rendered over the homepage's hero photo rather than a white bar. */
  overlay?: boolean;
}) {
  const { session, logout } = usePortalSession("user");
  const [, navigate] = useLocation();

  if (!session) {
    return (
      <Link
        href="/login"
        className={`h-9 px-4 rounded-full border text-sm font-medium transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 flex items-center ${overlay ? "border-white/65 bg-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.24),rgba(255,255,255,0.02)_55%,rgba(255,255,255,0.14))] backdrop-blur-[12px] backdrop-saturate-150 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),inset_0_-1px_1px_rgba(255,255,255,0.2),0_4px_16px_rgba(0,0,0,0.12)] hover:bg-white/20 hover:border-white/85" : "border-line-strong text-ink hover:bg-surface-3"}`}
      >
        Sign in
      </Link>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="w-9 h-9 rounded-full bg-ink text-surface flex items-center justify-center outline-none"
          aria-label="Account menu"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4.5 20c1.5-4 5-6 7.5-6s6 2 7.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-56 bg-surface rounded-panel border border-line shadow-[0_12px_32px_rgba(18,22,26,0.14)] py-2 origin-(--radix-dropdown-menu-content-transform-origin) data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:duration-150 data-[state=open]:duration-200 data-[state=open]:ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[state=closed]:ease-in"
        >
          {ITEMS.map((group) => (
            <div key={group.section} className="px-3 py-1.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-3 px-1 mb-1">{group.section}</p>
              {group.links.map((l) => (
                <DropdownMenu.Item key={l.href} asChild className="outline-none">
                  <Link
                    href={l.href}
                    className="block rounded-row px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors cursor-pointer"
                  >
                    {l.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </div>
          ))}
          <div className="border-t border-line mt-1 pt-1 px-3">
            <DropdownMenu.Item
              onSelect={() => {
                logout();
                navigate("/");
              }}
              className="rounded-row px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors cursor-pointer outline-none"
            >
              Sign out
            </DropdownMenu.Item>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
