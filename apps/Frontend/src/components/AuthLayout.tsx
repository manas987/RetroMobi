import { Link } from "wouter";
import { TerrainBackdrop } from "./TerrainBackdrop";

/**
 * Split-screen shell for every sign-in flow (customer, merchant, admin).
 * The left panel defaults to the home hero's own ink + contour-line
 * treatment; `backgroundImage`, when passed, swaps in a real photo instead
 * (used for the customer login only, not merchant/admin).
 */
export function AuthLayout({
  eyebrow,
  title,
  tagline,
  backgroundImage,
  children,
}: {
  eyebrow: string;
  title: string;
  tagline: string;
  backgroundImage?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-surface">
      <div
        className={`hidden lg:flex relative bg-ink items-end p-12 overflow-hidden ${backgroundImage ? "lg:w-[52%]" : "lg:w-[42%]"}`}
      >
        {backgroundImage ? (
          <>
            <img
              src={backgroundImage}
              alt=""
              aria-hidden="true"
              className="absolute -inset-y-16 inset-x-0 w-full h-[calc(100%+8rem)] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
          </>
        ) : (
          <TerrainBackdrop opacity={0.4} gradientId="auth-fade" />
        )}
        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-2 mb-8">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="6" cy="17" r="3.2" stroke="white" strokeWidth="1.6" />
              <circle cx="18" cy="17" r="3.2" stroke="white" strokeWidth="1.6" />
              <path
                d="M6 17 9 9h4l4 5h2M9 9 7.5 6.5"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-lg font-semibold tracking-tight text-white">retromobi</span>
          </Link>
          <h2 className="text-3xl font-bold text-white leading-[1.1] max-w-sm">{title}</h2>
          <p className="mt-3 text-white/70 text-sm max-w-xs">{tagline}</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden flex items-center gap-2 mb-8">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

          <p className="text-xs font-medium text-ink-3 tracking-wide uppercase">{eyebrow}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
