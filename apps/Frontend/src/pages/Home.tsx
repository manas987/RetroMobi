import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { VehicleCard } from "../components/VehicleCard";
import { useSearch } from "../lib/api";
import heroMountains from "../assets/hero-mountains.png";
import { DEFAULT_CITY, defaultWindow, toSearchParams } from "../lib/searchParams";

const WINDOW = defaultWindow();

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

  // The homepage used to never show an actual scooter — this pulls the same
  // search the capsule itself would run, for the default city and window.
  const { data: listingsData } = useSearch({
    city: DEFAULT_CITY,
    pickupAt: WINDOW.pickupAt,
    returnAt: WINDOW.returnAt,
    sort: "price",
    page: 1,
  });
  const listings = (listingsData?.results ?? []).slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <section className="max-w-[1400px] w-full mx-auto px-5 pt-6">
        <div className="relative rounded-panel overflow-hidden bg-ink min-h-[322px] h-[32.2vw] max-h-[434px] flex items-center">
          <img
            src={heroMountains}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,16,14,0.58)_0%,rgba(18,16,14,0.28)_42%,rgba(18,16,14,0)_70%)]" />
          <div className="relative z-10 px-6 py-10 sm:px-10 sm:py-14 pb-20 max-w-xl flex flex-col gap-4">
            <span className="self-start inline-flex items-center gap-2 rounded-full bg-white/18 backdrop-blur-sm text-white text-xs px-3 py-2">
              <PinIcon /> Uttarakhand, India
            </span>
            <h1 className="text-[clamp(1.8rem,3.8vw,3.15rem)] font-bold text-white leading-[1.06] tracking-[-0.035em] text-balance">
              Ride the road less ordinary.
            </h1>
            <p className="text-[clamp(0.95rem,1.1vw,1.05rem)] leading-[1.6] text-[#f1ede7] max-w-[460px] text-pretty">
              Licensed scooters and motorcycles for Dehradun, Haridwar and Rishikesh. Every scooter is
              shown with the licence it's rented under.
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

      {listings.length > 0 && (
        <section className="max-w-[1400px] w-full mx-auto px-5 pt-16 pb-16 flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-medium text-ink-3 tracking-wide uppercase">Available on your dates</span>
              <h2 className="text-2xl font-semibold text-ink">In {DEFAULT_CITY}</h2>
            </div>
            <a
              href={`/browse?${toSearchParams({ city: DEFAULT_CITY, pickupAt: WINDOW.pickupAt, returnAt: WINDOW.returnAt, sort: "price", page: 1 })}`}
              className="text-sm font-medium text-ink pb-0.5 border-b-[1.5px] border-[#708a76]"
            >
              See all in {DEFAULT_CITY} →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {listings.map((r) => (
              <VehicleCard key={`${r.model.id}:${r.primaryOffer.shopId}`} result={r} />
            ))}
          </div>
        </section>
      )}

      <section id="how-it-works" className="bg-surface-2 border-t border-line py-16 sm:py-24">
        <div className="max-w-[1400px] w-full mx-auto px-5 flex flex-col gap-14">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-ink-3 tracking-wide uppercase">How it works</span>
            <h2 className="text-2xl sm:text-[2.1rem] font-semibold text-ink tracking-tight">
              The confidence to go further.
            </h2>
          </div>

          <ol className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-0">
            {/* Same dashed-road + amber-dot language as the footer scene — one
                continuous track running from the first card's centre to the
                last, not per-card segments, so the dots land on each card's
                middle rather than its edge. Desktop-only: it would just break
                apart once the grid wraps to 2 or 1 columns. */}
            <div className="hidden lg:block absolute inset-x-0 top-0 h-5 pointer-events-none" aria-hidden="true">
              <span
                className="absolute top-1/2 -translate-y-1/2 h-0 border-t-2 border-dashed border-[#c3cfc4]"
                style={{ left: `${50 / STEPS.length}%`, right: `${50 / STEPS.length}%` }}
              />
              {STEPS.map((s, i) => (
                <span
                  key={s.title}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-amber shadow-[0_0_0_4px_#fdf0cf]"
                  style={{ left: `${((i + 0.5) / STEPS.length) * 100}%` }}
                />
              ))}
            </div>

            {STEPS.map((s) => (
              <li key={s.title} className="flex flex-col gap-3 lg:px-3.5">
                <div className="hidden lg:block h-5" />

                <div className="h-26 rounded-[14px] bg-surface border border-line flex flex-col justify-center gap-2.5 px-4.5">
                  {s.preview}
                </div>

                <span className="tnum text-sm font-semibold text-[#8a5d00] mt-2">{s.n}</span>
                <h3 className="font-medium text-lg text-ink">{s.title}</h3>
                <p className="text-ink-3 leading-relaxed text-pretty">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-surface-2 pb-16 sm:pb-24 px-5">
        <div className="max-w-[1400px] w-full mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-8 lg:gap-16">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-ink-3 tracking-wide uppercase">First time in the hills?</span>
            <h2 className="text-2xl sm:text-[2.1rem] font-semibold text-ink tracking-tight text-balance">
              Before your first ride
            </h2>
          </div>
          <Faq />
        </div>
      </section>

      <Footer />
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Search",
    body: "Pick a city and your dates. Nothing asks who you are until the booking step.",
    preview: (
      <>
        <span className="self-start inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-2 border border-line text-sm text-ink">
          <span className="w-2 h-2 rounded-full bg-[#708a76]" /> Browsing as guest
        </span>
        <span className="text-sm text-ink-3">No sign-in until you book</span>
      </>
    ),
  },
  {
    n: "02",
    title: "Compare",
    body: "See the real price, the shop and its licence. A scooter only appears when its registration is named on that licence.",
    preview: (
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-sm px-2 py-1 border-[1.5px] border-ink rounded-md tracking-wide text-ink">
          UK07 TA 2481
        </span>
        <CheckIcon />
      </div>
    ),
  },
  {
    n: "03",
    title: "Verify & pay",
    body: "Confirm your driving licence once and pay. The deposit's amount, who holds it and how it's returned are stated upfront.",
    preview: (
      <>
        <div className="flex justify-between items-baseline text-sm">
          <span className="text-ink-3">Refundable deposit</span>
          <span className="font-semibold text-[17px] text-ink">₹1,500</span>
        </div>
        <div className="h-px bg-line" />
        <div className="flex justify-between gap-2.5 text-xs text-ink-3">
          <span>Held by the shop</span>
          <span>Returned at drop-off</span>
        </div>
      </>
    ),
  },
  {
    n: "04",
    title: "Collect & ride",
    body: "Pick up at the shop, record the scooter's condition, and go.",
    preview: (
      <>
        <div className="flex gap-1.5">
          <span className="w-8.5 h-6.5 rounded-[5px] bg-[#e7ece6]" />
          <span className="w-8.5 h-6.5 rounded-[5px] bg-[#e7ece6]" />
          <span className="w-8.5 h-6.5 rounded-[5px] bg-[#e7ece6]" />
          <span className="w-8.5 h-6.5 rounded-[5px] bg-[#e7ece6] flex items-center justify-center text-[11px] text-ink-3">
            +3
          </span>
        </div>
        <span className="text-sm text-ink-3">Condition recorded at pickup</span>
      </>
    ),
  },
];

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#4f6e58" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FAQS = [
  {
    q: "Are helmets included?",
    a: "Each listing says how many helmets come with the vehicle and whether there is a charge. A helmet is required for both rider and pillion.",
  },
  {
    q: "What documents do I need?",
    a: "A valid driving licence for the vehicle class and a government photo ID. You upload the licence once, at the booking step.",
  },
  {
    q: "How does fuel work?",
    a: "The listing states the fuel policy — usually return it at the level you collected it. Photograph the fuel gauge with your pickup photos.",
  },
  {
    q: "Can I ride after dark?",
    a: "Check the listing — some shops restrict hill roads after sunset. Roads towards Mussoorie and beyond Rishikesh are narrow and unlit in places.",
  },
  {
    q: "What if it breaks down?",
    a: "Call the shop's number on your booking first. If it isn't resolved, raise it with our grievance officer from your booking page.",
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col">
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} className="border-b border-line">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-4 py-5 text-left text-lg font-medium text-ink"
            >
              {f.q}
              <span
                className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-base ${
                  isOpen ? "border-[#c3cfc4] bg-[#eef3ee] text-ink" : "border-line-strong text-ink-2"
                }`}
              >
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {isOpen && <p className="pb-5 pr-12 text-ink-3 leading-relaxed text-pretty">{f.a}</p>}
          </div>
        );
      })}
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="9" r="2.3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
