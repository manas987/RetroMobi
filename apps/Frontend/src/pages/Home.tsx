import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { RideFaqs } from "../components/RideFaqs";
import { SearchCapsule, type SearchCapsuleValue, type SearchCapsuleHandle } from "../components/SearchCapsule";
import heroHimalaya from "../assets/hero-himalaya.jpg";
import howSearch from "../assets/how-search.jpg";
import howCompare from "../assets/how-compare.jpg";
import howPay from "../assets/how-pay.jpg";
import howRide from "../assets/how-ride.jpg";
import { toSearchParams } from "../lib/searchParams";

export function Home() {
  const [, navigate] = useLocation();
  const searchRef = useRef<SearchCapsuleHandle>(null);
  const [returningToSearch, setReturningToSearch] = useState(false);

  useEffect(() => {
    if (!returningToSearch) return;
    function atTop() {
      if (window.scrollY > 1) return;
      searchRef.current?.openMissingField();
      setReturningToSearch(false);
    }
    window.addEventListener("scroll", atTop, { passive: true });
    // Abandon guidance if the visitor interrupts the smooth scroll.
    const timeout = window.setTimeout(() => setReturningToSearch(false), 2500);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    atTop();
    return () => {
      window.removeEventListener("scroll", atTop);
      window.clearTimeout(timeout);
    };
  }, [returningToSearch]);

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

        <div className="relative top-[10px] z-10 w-full px-5 flex flex-col items-center text-center gap-5">
          <h1
            className="text-[clamp(2rem,5vw,3.9rem)] font-normal text-white leading-[1.12] tracking-[-0.025em] text-balance"
          >
            Rent your next ride
            <br />
            with RetroMobi
          </h1>

          <div className="w-full mt-4">
            {/* Start blank; Search guides visitors to the first missing field. */}
            <SearchCapsule ref={searchRef} initial={{ city: "", pickupAt: "", returnAt: "" }} onSearch={goSearch} />
            <p className="mt-4 text-[13px] sm:text-sm leading-relaxed text-white/85 text-balance">
              Compare prices · See deposit details · Choose your shop
            </p>
          </div>
        </div>

        <div ref={heroEnd} aria-hidden="true" className="absolute bottom-0 left-0 w-px h-px" />
      </section>

      {/* Everything around this is a grid of things to scan; this is the only
          place that just talks, so it gets a single narrow centred column and
          nothing else competing for the eye. */}
      <section className="px-5 py-20 sm:pt-[max(1rem,calc(12svh-13px))] sm:pb-28">
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

      <RideFaqs />

      <Footer onBrowse={() => setReturningToSearch(true)} />
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

function SparkIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" className="text-amber" aria-hidden="true">
      <path d="M12 1.5Q13.1 10.9 22.5 12 13.1 13.1 12 22.5 10.9 13.1 1.5 12 10.9 10.9 12 1.5Z" />
    </svg>
  );
}

