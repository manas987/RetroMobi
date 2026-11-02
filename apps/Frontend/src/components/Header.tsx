import { Link } from "wouter";
import { ShoppingCart } from "lucide-react";
import { ProfileMenu } from "./ProfileMenu";
import { CartDrawer } from "./CartDrawer";
import { useCart } from "../lib/cart";

export function Header({ overlay = false, center }: {
  /** Sit transparent on top of whatever is behind — the homepage's full-bleed
   *  hero photo. Default off, so every other page is unaffected. */
  overlay?: boolean;
  /** Dropped on the bar's centre line — Browse's search capsule and Filters
   *  pill. Supplying it switches the bar from justify-between to a three-track
   *  grid, which is what centres this against the page rather than against
   *  whatever the logo and the account cluster happen to measure. */
  center?: React.ReactNode;
}) {
  const { totalUnits, openDrawer } = useCart();

  const brand = overlay ? "text-white" : "text-ink";
  const link = overlay ? "text-white/85 hover:text-white" : "text-ink-2 hover:text-ink";

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
      <div
        /* Taller only when it carries the capsule: 64px leaves it about 5px of
           air a side, which reads as clipped. Home's hero still offsets against
           a 64px bar (-mt-16 / pt-16) and has no `center`, so it is untouched.

           The extra 10px is height *and* padding-top, so all of it lands above
           the capsule — the content stays centred in what is left, which keeps
           the gap under it exactly where it was. */
        className={`max-w-[1619px] mx-auto px-5 gap-6 ${center ? "h-[104px] pt-[10px]" : "h-16"} ${
          /* minmax(0,1fr), not 1fr: a bare 1fr floors at its own min-content,
             so the account cluster's width was being mirrored into the empty
             left track and the centre got squeezed to a sliver. Tailwind's own
             grid-cols-* emit minmax(0,1fr) for this reason. */
          center
            ? "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
            : "flex items-center justify-between"
        }`}
      >
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

        {center}

        <div className="flex items-center justify-end gap-3 shrink-0">
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
