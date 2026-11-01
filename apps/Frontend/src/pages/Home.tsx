import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import { VehicleCard } from "../components/VehicleCard";
import { useSearch } from "../lib/api";
import heroMountains from "../assets/hero-mountains.png";
import howSearch from "../assets/how-search.jpg";
import howCompare from "../assets/how-compare.jpg";
import howPay from "../assets/how-pay.jpg";
import howRide from "../assets/how-ride.jpg";
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

      {/* Everything around this is a grid of things to scan; this is the only
          place that just talks, so it gets a single narrow centred column and
          nothing else competing for the eye. */}
      <section className="px-5 py-20 sm:py-28">
        <div className="max-w-[46rem] mx-auto flex flex-col items-center text-center gap-9">
          <SparkIcon />

          <h2 className="text-2xl sm:text-[2.1rem] font-semibold text-ink tracking-tight leading-[1.25] text-balance">
            Renting a ride should feel like the beginning of your trip—not the first risk you take.
          </h2>

          <p className="text-lg sm:text-xl leading-relaxed text-ink-2 text-pretty">
            <strong className="font-semibold text-ink">Retromobi was created</strong> because renting a two-wheeler
            still involves too much guesswork. Prices are difficult to compare, vehicle details are often unclear, and
            trusting an unfamiliar rental shop can feel like a gamble. We bring verified rental businesses into one
            marketplace, where you can compare the total price, pickup distance, rental duration, deposit and vehicle
            details before booking. Every ride begins with a condition video, creating a shared record for a smooth,
            dispute-free return.
          </p>

          {/* Not --color-amber: that one is fill-only, 1.9:1 as type on white.
              This is the same dark amber the step numbers below already use. */}
          <blockquote className="font-serif italic text-xl sm:text-2xl leading-snug text-[#8a5d00] text-balance mt-1">
            &ldquo;Compare clearly. Book confidently. Ride without worry.&rdquo;
          </blockquote>
        </div>
      </section>

      <section id="how-it-works" className="py-16 sm:py-24">
        <div className="max-w-[1400px] w-full mx-auto px-5 flex flex-col gap-14">
          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-ink-3 tracking-wide uppercase">How it works</span>
            <h2 className="text-2xl sm:text-[2.1rem] font-semibold text-ink tracking-tight">
              The confidence to go further.
            </h2>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-12">
            {STEPS.map((s) => (
              <li key={s.title} className="flex flex-col gap-2">
                {/* Decorative: every one of these restates the text beside it,
                    so an alt would just make a screen reader say it twice. */}
                <img
                  src={s.img}
                  alt=""
                  loading="lazy"
                  className="w-full aspect-[3/2] object-cover rounded-[14px] border border-line bg-surface mb-3"
                />
                <span className="tnum text-sm font-semibold text-[#8a5d00]">{s.n}</span>
                <h3 className="font-medium text-lg text-ink">{s.title}</h3>
                <p className="text-ink-3 leading-relaxed text-pretty">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-16 sm:pb-24 px-5">
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
    title: "Find your ride",
    body: "Pick your city and dates. Explore scooters near you, with no sign-up until you book.",
    img: howSearch,
  },
  {
    n: "02",
    title: "Compare with confidence",
    body: "Compare prices, pickup distance and rental timings. See the full cost and shop details upfront, so you know exactly what you're choosing.",
    img: howCompare,
  },
  {
    n: "03",
    title: "Know before you pay",
    body: "See the deposit, rental terms and return policy before booking. Clear details, fewer surprises.",
    img: howPay,
  },
  {
    n: "04",
    title: "Record. Ride. Return.",
    body: "Record a pickup video to document your scooter's condition. Ride with confidence, then return it with a clear record that helps resolve any questions.",
    img: howRide,
  },
];

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

function SparkIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" className="text-amber" aria-hidden="true">
      <path d="M12 1.5Q13.1 10.9 22.5 12 13.1 13.1 12 22.5 10.9 13.1 1.5 12 10.9 10.9 12 1.5Z" />
    </svg>
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
