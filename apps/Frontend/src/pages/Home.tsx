import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { SearchCapsule, type SearchCapsuleValue } from "../components/SearchCapsule";
import heroHimalaya from "../assets/hero-himalaya.jpg";
import howSearch from "../assets/how-search.jpg";
import howCompare from "../assets/how-compare.jpg";
import howPay from "../assets/how-pay.jpg";
import howRide from "../assets/how-ride.jpg";
import { toSearchParams } from "../lib/searchParams";

export function Home() {
  const [, navigate] = useLocation();

  // Arriving here from another page via Header's "How it works" link.
  useEffect(() => {
    if (window.location.hash === "#how-it-works") {
      document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // The header sits transparent on the photo and turns solid once it has
  // cleared it. Watching a 1px marker at the hero's foot, inset by the header's
  // own height, means nothing runs per scroll frame.
  const heroEnd = useRef<HTMLDivElement>(null);
  const [overHero, setOverHero] = useState(true);

  useEffect(() => {
    const el = heroEnd.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOverHero(!!e?.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function goSearch(v: SearchCapsuleValue) {
    navigate(`/browse?${toSearchParams({ ...v, sort: "price", page: 1 })}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header overlay={overHero} />

      {/* -mt-16 lifts the photo under the sticky 64px header so it reaches the
          very top of the window; the section's height is unchanged, so what
          follows rides up with it and the hero occupies exactly 0 → 88svh.
          pt-16 puts the content back in the middle of the part you can see.
          svh, not vh, so mobile browser chrome can't crop it, and min-h so a
          short phone grows the section rather than clipping the stacked bar.

          The bottom padding is what holds the block above centre, so it is the
          dial for how far down the block sits: the content is centred between
          the two paddings, so every 2px off pb moves it 1px down. 320 → 260 is
          the 30px drop. Only sm and up — a phone has no slack to give, the
          stacked bar already fills the hero. */}
      <section className="relative -mt-16 pt-16 sm:pb-[260px] min-h-[88svh] flex items-center justify-center overflow-hidden bg-ink">
        <img
          src={heroHimalaya}
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Two layers, because the frame isn't evenly lit: the sunrise at the
            top is its brightest part and is exactly where the header's white
            text lands, while the forest at the foot is already dark. Lands at
            ~0.63 behind the header, ~0.39 behind the headline, ~0.59 at the
            bottom. */}
        <div className="absolute inset-0 bg-ink/25" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(18,16,14,0.5)_0%,rgba(18,16,14,0.18)_38%,rgba(18,16,14,0.45)_100%)]" />

        <div className="relative z-10 w-full px-5 flex flex-col items-center text-center gap-5">
          <h1 className="text-[clamp(2.1rem,5vw,3.9rem)] font-bold text-white leading-[1.04] tracking-[-0.035em] text-balance max-w-[16ch]">
            RetroMobi
          </h1>
          <p className="text-[clamp(0.95rem,1.2vw,1.1rem)] leading-[1.6] text-white/85 max-w-[48ch] text-pretty">
            Compare licensed scooters across Dehradun, Haridwar and Rishikesh. Clear prices and
            vehicle details before you book.
          </p>

          <div className="w-full mt-4">
            {/* Blank, not pre-filled: landing on a city and a window nobody
                chose is exactly what the copy above promises not to do. Search
                stays disabled until both are set. */}
            <SearchCapsule initial={{ city: "", pickupAt: "", returnAt: "" }} onSearch={goSearch} />
          </div>
        </div>

        <div ref={heroEnd} aria-hidden="true" className="absolute bottom-0 left-0 w-px h-px" />
      </section>

      {/* Everything around this is a grid of things to scan; this is the only
          place that just talks, so it gets a single narrow centred column and
          nothing else competing for the eye. */}
      <section className="px-5 py-20 sm:py-28">
        <div className="max-w-[46rem] mx-auto flex flex-col items-center text-center gap-9">
          <SparkIcon />

          <p className="text-lg sm:text-xl leading-relaxed text-ink-2 text-pretty">
            <strong className="font-semibold text-ink">We started Retromobi to build the place we wished existed.</strong>{" "}
            A place where travellers could understand their options without calling shop after shop, and owners could
            hand over their vehicles without relying on blind trust. Where the price is known, the terms are clear, and
            every mark is recorded before the journey begins. Because when both people can see the same truth, trust no
            longer needs to be assumed. It can be quietly built into the experience.
          </p>

          {/* Not --color-amber: that one is fill-only, 1.9:1 as type on white.
              This is the same dark amber the step numbers below already use. */}
          <blockquote className="font-serif italic text-xl sm:text-2xl leading-snug text-[#8a5d00] text-balance mt-1">
            &ldquo;More road to remember.
            <br />
            Less reason to worry.&rdquo;
          </blockquote>
        </div>
      </section>

      <section id="how-it-works" className="pt-16 pb-20 sm:pt-24 sm:pb-30">
        <div className="max-w-[1299px] w-full mx-auto px-5">
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-12 sm:w-[90%] sm:mx-auto">
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

      <section className="px-5 pb-20 sm:pb-30">
        <div className="max-w-[1299px] w-full mx-auto">
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

            <ul className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 xl:flex xl:items-start xl:gap-0 xl:justify-center">
              {FAQS.map((f, i) => {
                const p = PINBOARD[i]!;
                return (
                  <li
                    key={f.q}
                    style={{ zIndex: i }}
                    className={`relative rounded-panel xl:w-[22%] xl:shrink-0 xl:-ml-10 xl:first:ml-0 xl:bg-surface xl:rounded-[18px] xl:shadow-[0_14px_34px_-16px_rgba(18,22,26,0.3)] ${p.frame} ${p.tilt} ${i % 2 ? "xl:mt-14" : ""}`}
                  >
                    <Pin at={p.pin} color={p.color} />
                    <div className={`h-full xl:h-auto rounded-panel p-5 ${f.tint}`}>
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

