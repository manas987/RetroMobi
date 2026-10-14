import { useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { defaultWindow, toSearchParams } from "../lib/searchParams";

const WINDOW = defaultWindow();
const DEFAULT_CITY = "Dehradun";

export function Home() {
  const [, navigate] = useLocation();

  // Arriving here from another page via Header's "How it works" link.
  useEffect(() => {
    if (window.location.hash === "#how-it-works") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  function goSearch(v: SearchCapsuleValue) {
    navigate(`/browse?${toSearchParams({ ...v, sort: "price", page: 1 })}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="max-w-[1400px] w-full mx-auto px-5 pt-6">
        <div className="relative rounded-panel overflow-hidden bg-ink min-h-[420px] flex items-center">
          <TerrainBackdrop />
          <div className="relative z-10 px-8 py-16 sm:px-14 max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 text-white text-xs font-medium px-3 py-1.5">
              <PinIcon /> Uttarakhand, India
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl font-bold text-white leading-[1.05] tracking-tight">
              Ride the road less ordinary.
            </h1>
            <p className="mt-4 text-white/70 text-base leading-relaxed max-w-sm">
              Licensed scooters and motorcycles for Dehradun, Haridwar and Rishikesh. Every listing
              carries the authority that licensed it.
            </p>
          </div>
        </div>

        <div className="relative -mt-8 px-4 sm:px-8 z-10">
          <SearchCapsule
            initial={{ city: DEFAULT_CITY, pickupAt: WINDOW.pickupAt, returnAt: WINDOW.returnAt }}
            onSearch={goSearch}
          />
        </div>
      </section>

      <section className="max-w-[1400px] w-full mx-auto px-5 pt-16 pb-16">
        <p className="text-xs font-medium text-ink-3 tracking-wide uppercase">Why RetroMobi</p>
        <h2 className="text-2xl font-semibold text-ink mt-1 mb-8 max-w-lg">
          The confidence to go further.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <Principle
            title="Licensed, not just listed"
            body="A scooter only appears here when its registration number is named on the shop's rental licence."
          />
          <Principle
            title="The deposit, stated plainly"
            body="Every listing states the refundable deposit's amount, who holds it, and the condition for its return."
          />
          <Principle
            title="Browse without an account"
            body="Nothing before the booking step asks who you are. Verification happens once, at the moment it's needed."
          />
        </div>
      </section>

      <section id="how-it-works" className="bg-surface-2 border-y border-line py-16">
        <div className="max-w-[1400px] w-full mx-auto px-5">
          <h2 className="text-2xl font-semibold text-ink mb-8">How it works</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              ["Search", "Pick a city and your dates — no sign-in required to browse."],
              ["Compare", "See the real price, the deposit, the shop, and its licence."],
              ["Verify & pay", "Confirm your driving licence and pay once you're ready to book."],
              ["Collect & ride", "Pick up at the shop, record the scooter's condition, and go."],
            ].map(([title, body], i) => (
              <li key={title}>
                <div className="tnum text-xs font-semibold text-amber-edge mb-2">0{i + 1}</div>
                <div className="font-medium text-ink mb-1">{title}</div>
                <p className="text-sm text-ink-3">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="font-medium text-ink mb-1.5">{title}</div>
      <p className="text-sm text-ink-3 leading-relaxed">{body}</p>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="9" r="2.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Abstract contour lines, not a stock photograph — RetroMobi has no real fleet
 *  photography yet, and PRODUCT.md is explicit that none should be implied. */
function TerrainBackdrop() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.35]"
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1f6b43" stopOpacity="0" />
          <stop offset="100%" stopColor="#1f6b43" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {[60, 110, 160, 210, 260, 310, 360].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} C 150 ${y - 40 - i * 4}, 280 ${y + 50 + i * 6}, 420 ${y - 10} S 700 ${y - 60}, 800 ${y + 20 - i * 3}`}
          fill="none"
          stroke="url(#fade)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}
