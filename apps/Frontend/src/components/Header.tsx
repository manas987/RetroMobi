import { Link, useLocation } from "wouter";
import { ShoppingCart } from "lucide-react";
import { ProfileMenu } from "./ProfileMenu";
import { CartDrawer } from "./CartDrawer";
import { useCart } from "../lib/cart";

export function Header() {
  const [path, navigate] = useLocation();
  const { totalUnits, openDrawer } = useCart();

  function goHowItWorks(e: React.MouseEvent) {
    e.preventDefault();
    if (path === "/") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/#how-it-works");
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-sm border-b border-line">
      <div className="max-w-[1400px] mx-auto px-5 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="6" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="18" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M6 17 9 9h4l4 5h2M9 9 7.5 6.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-lg font-semibold tracking-tight text-ink">retromobi</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm text-ink-2">
          <a href="/#how-it-works" onClick={goHowItWorks} className="hover:text-ink transition-colors">
            How it works
          </a>
          <Link href="/browse" className="hover:text-ink transition-colors">
            Browse scooters
          </Link>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/merchant/login"
            className="hidden sm:inline-flex h-9 px-4 rounded-full items-center text-sm font-medium text-ink-2 hover:text-ink transition-colors"
          >
            List your fleet
          </Link>
          <button
            type="button"
            onClick={openDrawer}
            aria-label={`Cart, ${totalUnits} item${totalUnits === 1 ? "" : "s"}`}
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors"
          >
            <ShoppingCart className="h-[18px] w-[18px]" />
            {totalUnits > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-amber text-on-amber text-[10px] font-semibold flex items-center justify-center">
                {totalUnits}
              </span>
            )}
          </button>
          <ProfileMenu />
        </div>
      </div>
      <CartDrawer />
    </header>
  );
}
