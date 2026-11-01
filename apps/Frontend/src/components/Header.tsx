import { Link, useLocation } from "wouter";
import { ShoppingCart } from "lucide-react";
import { ProfileMenu } from "./ProfileMenu";
import { CartDrawer } from "./CartDrawer";
import { useCart } from "../lib/cart";

export function Header({ overlay = false }: {
  /** Sit transparent on top of whatever is behind — the homepage's full-bleed
   *  hero photo. Default off, so every other page is unaffected. */
  overlay?: boolean;
}) {
  const [path, navigate] = useLocation();
  const { totalUnits, openDrawer } = useCart();

  const brand = overlay ? "text-white" : "text-ink";
  const link = overlay ? "text-white/85 hover:text-white" : "text-ink-2 hover:text-ink";

  function goHowItWorks(e: React.MouseEvent) {
    e.preventDefault();
    if (path === "/") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/#how-it-works");
    }
  }

  return (
    <header
      className={`sticky top-0 z-40 transition-colors ${
        /* The hairline is a shadow, not a border: a border would make this
           element 65px tall against the hero's -mt-16, showing a 1px strip of
           page background above the photo, and would shift the page by 1px
           every time this swapped. A shadow draws the same line, no layout. */
        overlay ? "bg-transparent" : "bg-surface/95 backdrop-blur-sm shadow-[0_1px_0_var(--color-line)]"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-5 h-16 flex items-center justify-between gap-6">
        <Link href="/" className={`flex items-center gap-2 shrink-0 transition-colors ${brand}`}>
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
          <span className={`text-lg font-semibold tracking-tight transition-colors ${brand}`}>retromobi</span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm">
          <a href="/#how-it-works" onClick={goHowItWorks} className={`transition-colors ${link}`}>
            How it works
          </a>
          <Link href="/browse" className={`transition-colors ${link}`}>
            Browse scooters
          </Link>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/merchant/login"
            className={`hidden sm:inline-flex h-9 px-4 rounded-full items-center text-sm font-medium transition-colors ${link}`}
          >
            List your fleet
          </Link>
          <button
            type="button"
            onClick={openDrawer}
            aria-label={`Cart, ${totalUnits} item${totalUnits === 1 ? "" : "s"}`}
            className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${overlay ? "text-white/85 hover:text-white hover:bg-white/15" : "text-ink-2 hover:text-ink hover:bg-surface-3"}`}
          >
            <ShoppingCart className="h-[18px] w-[18px]" />
            {totalUnits > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-amber text-on-amber text-[10px] font-semibold flex items-center justify-center">
                {totalUnits}
              </span>
            )}
          </button>
          <ProfileMenu overlay={overlay} />
        </div>
      </div>
      <CartDrawer />
    </header>
  );
}
