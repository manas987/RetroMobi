import { useEffect } from "react";
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

      <section className="px-5 pb-16 sm:pb-24">
        <div className="max-w-[1400px] w-full mx-auto">
          <div className="flex flex-col items-center text-center gap-3 mb-12">
            <span className="text-xs font-medium text-ink-3 tracking-wide uppercase">First time in the hills?</span>
            <h2 className="text-2xl sm:text-[2.1rem] font-semibold text-ink tracking-tight text-balance">
              Before your first ride
            </h2>
            <p className="text-ink-3">Quick answers to what riders ask us most.</p>
          </div>

          {/* items-start, so each card is only as tall as its own answer —
              equal heights would read as a table rather than as notes on a
              board. The tint lives on the inner div, not the li: below xl the
              li has no box of its own so that div *is* the flat card, and at
              xl the li becomes the white paper the note is pinned to. One DOM,
              no branch. */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="hidden xl:flex absolute -inset-x-5 inset-y-0 flex-col justify-between pointer-events-none"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span key={i} className="border-t border-dashed border-line" />
              ))}
            </div>

            <ul className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start xl:flex xl:gap-0 xl:justify-center">
              {FAQS.map((f, i) => {
                const p = PINBOARD[i]!;
                return (
                  <li
                    key={f.q}
                    style={{ zIndex: i }}
                    className={`relative rounded-panel xl:w-[22%] xl:shrink-0 xl:-ml-10 xl:first:ml-0 xl:bg-surface xl:rounded-[18px] xl:shadow-[0_14px_34px_-16px_rgba(18,22,26,0.3)] ${p.frame} ${p.tilt} ${i % 2 ? "xl:mt-14" : ""}`}
                  >
                    <Pin at={p.pin} color={p.color} />
                    <div className={`rounded-panel p-5 ${f.tint}`}>
                      <span className="tnum text-sm font-semibold text-[#8a5d00]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-medium text-ink mt-2 text-balance">{f.q}</h3>
                      <p className="text-sm text-ink-2 leading-relaxed mt-2 text-pretty">{f.a}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
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

// Hand-set, not computed: an even -2/+2/-2 alternation reads as a pattern,
// which is the opposite of looking pinned up by a person. The uneven frame
// padding is what makes the white border sit differently on each note. Tilts
// stay at or under 2deg so the text underneath stays crisp.
const PINBOARD = [
  { tilt: "xl:-rotate-2", frame: "xl:p-3 xl:pb-7", pin: "xl:left-[27%]", color: "#e8a93a" },
  { tilt: "xl:rotate-[1.4deg]", frame: "xl:p-3 xl:pt-8", pin: "xl:left-[18%]", color: "#5f9c76" },
  { tilt: "xl:-rotate-1", frame: "xl:p-3 xl:pb-6", pin: "xl:left-[62%]", color: "#6f93c4" },
  { tilt: "xl:rotate-2", frame: "xl:p-3 xl:pt-7", pin: "xl:left-[34%]", color: "#c98a94" },
  { tilt: "xl:rotate-[-1.4deg]", frame: "xl:p-3 xl:pb-8", pin: "xl:left-[58%]", color: "#a8a096" },
];

function Pin({ at, color }: { at: string; color: string }) {
  return (
    <svg
      width="20"
      height="28"
      viewBox="0 0 20 28"
      aria-hidden="true"
      className={`hidden xl:block absolute -top-3.5 ${at} drop-shadow-[0_3px_4px_rgba(18,22,26,0.22)]`}
    >
      <path d="M10 11.5v15" stroke="#9aa0a6" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="7" r="6.5" fill={color} />
      <circle cx="7.6" cy="4.8" r="2" fill="#ffffff" opacity="0.45" />
    </svg>
  );
}

const FAQS = [
  {
    q: "Are helmets included?",
    a: "Each listing says how many helmets come with the vehicle and whether there is a charge. A helmet is required for both rider and pillion.",
    tint: "bg-amber-soft",
  },
  {
    q: "What documents do I need?",
    a: "A valid driving licence for the vehicle class and a government photo ID. You upload the licence once, at the booking step.",
    tint: "bg-verified-soft",
  },
  {
    q: "How does fuel work?",
    a: "The listing states the fuel policy — usually return it at the level you collected it. Photograph the fuel gauge with your pickup photos.",
    tint: "bg-[#eef2f6]",
  },
  {
    q: "Can I ride after dark?",
    a: "Check the listing — some shops restrict hill roads after sunset. Roads towards Mussoorie and beyond Rishikesh are narrow and unlit in places.",
    tint: "bg-[#f7eef0]",
  },
  {
    q: "What if it breaks down?",
    a: "Call the shop's number on your booking first. If it isn't resolved, raise it with our grievance officer from your booking page.",
    tint: "bg-surface-3",
  },
];

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
