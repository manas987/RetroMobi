import { Link, useLocation } from "wouter";
import { ProfileMenu } from "./ProfileMenu";

export function Header() {
  const [path, navigate] = useLocation();

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
          <Link href="/browse" className="hover:text-ink transition-colors">
            Browse scooters
          </Link>
          <a href="/#how-it-works" onClick={goHowItWorks} className="hover:text-ink transition-colors">
            How it works
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/merchant/login"
            className="hidden sm:inline-flex h-9 px-4 rounded-full items-center text-sm font-medium text-ink-2 hover:text-ink transition-colors"
          >
            List your fleet
          </Link>
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
