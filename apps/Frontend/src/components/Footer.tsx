import { useState } from "react";
import { Link, useLocation } from "wouter";
import { FooterScene } from "./FooterScene";
import { CITIES } from "./SearchCapsule";
import { DEFAULT_CITY, defaultWindow, toSearchParams } from "../lib/searchParams";

const WINDOW = defaultWindow();

function cityHref(city: string): string {
  return `/browse?${toSearchParams({ city, pickupAt: WINDOW.pickupAt, returnAt: WINDOW.returnAt, sort: "price", page: 1 })}`;
}

export function Footer() {
  const [path, navigate] = useLocation();
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);

  function goHowItWorks(e: React.MouseEvent) {
    e.preventDefault();
    if (path === "/") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/#how-it-works");
    }
  }

  return (
    <footer className="border-t border-line bg-surface-2 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-5 pt-16 flex flex-wrap gap-12 justify-between">
        <div className="flex-1 min-w-[260px] max-w-sm flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2">
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
          <p className="text-sm text-ink-3 max-w-xs">
            Licensed scooter and motorcycle rentals across Dehradun, Haridwar and Rishikesh.
          </p>
          <Link
            href={cityHref(DEFAULT_CITY)}
            className="self-start mt-1 inline-flex items-center gap-2 px-5 py-3 rounded-row bg-amber text-on-amber font-semibold text-sm hover:brightness-95 transition-[filter]"
          >
            Browse scooters <span aria-hidden="true">→</span>
          </Link>
        </div>

        <nav className="flex-[2] min-w-[300px] grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-8 text-sm">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Marketplace</div>
            <a href="#" onClick={goHowItWorks} className="text-ink-2 hover:text-ink transition-colors">
              How it works
            </a>
            <Link href="/merchant/login" className="text-ink-2 hover:text-ink transition-colors">
              List your fleet
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Cities</div>
            {CITIES.map((city) => (
              <Link
                key={city}
                href={cityHref(city)}
                onMouseEnter={() => setHoveredCity(city)}
                onMouseLeave={() => setHoveredCity(null)}
                className={`transition-colors ${hoveredCity === city ? "text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {city}
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Support</div>
            {/* Name/designation/contact aren't filled in yet — India's
                consumer-protection rules require a named grievance officer,
                not just a link, so this stays a visible placeholder rather
                than a dead link until that's supplied. */}
            <div className="flex flex-col gap-0.5">
              <span className="text-ink-2">Grievance officer</span>
              <span className="text-xs text-ink-4">[Name], [Designation] · [email · phone]</span>
            </div>
            <span className="text-ink-2">National Consumer Helpline</span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Policies</div>
            <span className="text-ink-2">Privacy notice</span>
            <span className="text-ink-2">User agreement</span>
            <span className="text-ink-2">Cancellation policy</span>
            <span className="text-ink-2">Ranking parameters</span>
          </div>
        </nav>
      </div>

      <div className="mt-10">
        <FooterScene hoveredCity={hoveredCity} onHoverCity={setHoveredCity} />
      </div>
    </footer>
  );
}
