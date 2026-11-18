import { useLayoutEffect, useRef } from "react";
import { createFaqRope, pushFaqPoint, ROPE_STEP, stepFaqRope, type RopePull } from "../lib/faqRope";
import { useMediaQuery } from "../lib/useMediaQuery";

const CLIP_OFFSET = 17;
const SETTLE_STEPS = 360;

const FAQS = [
  {
    q: "Are helmets included?",
    a: "Each listing says how many helmets come with the vehicle and whether there is a charge. A helmet is required for both rider and pillion.",
    tint: "bg-amber-soft",
  },
  {
    q: "What documents do I need?",
    a: "A valid driving licence for the vehicle class and a government photo ID. Bring the original to pickup: the shop checks it before handing over the keys.",
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

function limit(value: number, max: number) {
  return Math.max(-max, Math.min(max, value));
}

export function RideFaqs() {
  const boardRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wide = useMediaQuery("(min-width: 80rem)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useLayoutEffect(() => {
    const board = boardRef.current;
    const list = listRef.current;
    const canvas = canvasRef.current;
    if (!wide || !board || !list || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const elements = Array.from(list.querySelectorAll("li"));
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    let simulation: ReturnType<typeof createFaqRope> | undefined;
    let pivots: { x: number; y: number }[] = [];
    let width = 0;
    let height = 0;
    let canvasTop = 0;
    let frame = 0;
    let time = 0;
    let elapsed = 0;
    let remaining = 0;
    let previousPointer: { x: number; y: number; cardIndex: number; onRope: boolean } | undefined;
    let drag: {
      element: HTMLElement;
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      pull: RopePull;
    } | undefined;

    const paint = () => {
      if (!simulation) return;
      context.clearRect(0, canvasTop, width, height);
      context.beginPath();
      const [first, ...points] = simulation.rope;
      context.moveTo(first!.x, first!.y);
      for (const point of points) context.lineTo(point.x, point.y);
      context.lineJoin = "round";
      context.lineCap = "round";
      context.strokeStyle = "#9b7954";
      context.lineWidth = 3;
      context.stroke();
      context.strokeStyle = "#c5a37c";
      context.lineWidth = 1;
      context.stroke();
      for (const anchor of [first!, points[points.length - 1]!]) {
        context.beginPath();
        context.arc(anchor.x, anchor.y, 3.5, 0, Math.PI * 2);
        context.fillStyle = "#806344";
        context.fill();
      }

      simulation.cards.forEach(({ clip, body }, index) => {
        const { x, y } = pivots[index]!;
        const style = elements[index]!.style;
        style.setProperty("--faq-translate", `${(clip.x - x).toFixed(2)}px ${(clip.y - y).toFixed(2)}px`);
        style.setProperty("--faq-rotate", `${Math.atan2(clip.x - body.x, body.y - clip.y).toFixed(4)}rad`);
      });
    };

    const tick = (now: number) => {
      frame = 0;
      if (!simulation) return;
      elapsed += time ? Math.min((now - time) / 1000, 1 / 30) : ROPE_STEP;
      time = now;
      while (elapsed >= ROPE_STEP) {
        stepFaqRope(simulation, drag?.pull);
        elapsed -= ROPE_STEP;
        remaining--;
      }
      paint();
      if (remaining > 0 || drag) frame = requestAnimationFrame(tick);
    };

    const wake = () => {
      remaining = SETTLE_STEPS;
      if (frame) return;
      time = elapsed = 0;
      frame = requestAnimationFrame(tick);
    };

    const release = () => {
      if (!drag) return;
      const { element, pointerId } = drag;
      drag = undefined;
      delete element.dataset.dragging;
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    };

    const reset = () => {
      release();
      cancelAnimationFrame(frame);
      frame = 0;
      simulation = undefined;
      previousPointer = undefined;
      board.removeAttribute("data-rope-grip");
      width = list.clientWidth;
      height = canvas.clientHeight;
      canvasTop = canvas.offsetTop;
      if (!width || !height) return;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, -canvasTop * pixelRatio);
      pivots = elements.map((element) => ({
        x: element.offsetLeft + element.offsetWidth / 2,
        y: element.offsetTop - CLIP_OFFSET,
      }));
      simulation = createFaqRope(width, elements.map((element, index) => ({
        x: pivots[index]!.x,
        length: element.offsetHeight * 0.48 + CLIP_OFFSET,
      })));
      paint();
    };

    const cardIndexAt = (event: PointerEvent) => {
      const element = (event.target as Element).closest<HTMLLIElement>("li");
      return element ? elements.indexOf(element) : -1;
    };

    const ropePointAt = (event: PointerEvent) => {
      if (!simulation) return;
      const { left, top } = canvas.getBoundingClientRect();
      const x = event.clientX - left;
      const y = event.clientY - top + canvasTop;
      const { rope } = simulation;
      for (let i = 1; i < rope.length; i++) {
        const from = rope[i - 1]!;
        const to = rope[i]!;
        if (x < from.x || x > to.x) continue;
        const fraction = (x - from.x) / (to.x - from.x);
        if (Math.abs(y - (from.y + (to.y - from.y) * fraction)) > 9) return;
        const point = fraction < 0.5 ? from : to;
        return point.inverseMass ? point : undefined;
      }
    };

    if (!reducedMotion) {
      board.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary || event.button !== 0 || drag || !simulation) return;
        const cardIndex = cardIndexAt(event);
        const point = simulation.cards[cardIndex]?.body ?? ropePointAt(event);
        if (!point) return;
        event.preventDefault();
        const element = elements[cardIndex] ?? board;
        drag = {
          element,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: point.x,
          originY: point.y,
          pull: { point, x: point.x, y: point.y },
        };
        element.setPointerCapture(event.pointerId);
        element.dataset.dragging = "";
        wake();
      }, options);

      board.addEventListener("pointermove", (event) => {
        if (drag) {
          if (event.pointerId !== drag.pointerId) return;
          drag.pull.x = drag.originX + limit(event.clientX - drag.startX, 48);
          drag.pull.y = drag.originY + limit(event.clientY - drag.startY, 56);
          wake();
          return;
        }
        if (event.pointerType === "touch" || !simulation) return;

        const cardIndex = cardIndexAt(event);
        const card = simulation.cards[cardIndex];
        const ropePoint = card ? undefined : ropePointAt(event);
        board.toggleAttribute("data-rope-grip", Boolean(ropePoint));
        const point = card?.body ?? ropePoint;
        const previous = previousPointer;
        previousPointer = { x: event.clientX, y: event.clientY, cardIndex, onRope: Boolean(ropePoint) };
        if (!point) return;

        const dx = previous ? event.clientX - previous.x : 0;
        const dy = previous ? event.clientY - previous.y : 0;
        if (previous && !dx && !dy) return;
        if (card && previous?.cardIndex !== cardIndex) {
          const clipX = board.getBoundingClientRect().left + card.clip.x;
          const direction = Math.sign(dx || clipX - event.clientX) || 1;
          pushFaqPoint(point, direction * 60, 185);
        } else if (ropePoint && !previous?.onRope) {
          pushFaqPoint(point, limit(dx * 2, 28), dy < 0 ? -135 : 135);
        } else {
          pushFaqPoint(point, limit(dx * 3, 42), limit(dy * 3, 42));
        }
        wake();
      }, options);

      const finish = (event: PointerEvent) => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        release();
        previousPointer = undefined;
        wake();
      };
      board.addEventListener("pointerup", finish, options);
      board.addEventListener("pointercancel", finish, options);
      board.addEventListener("lostpointercapture", finish, options);
      board.addEventListener("pointerleave", () => {
        previousPointer = undefined;
        board.removeAttribute("data-rope-grip");
      }, options);
    }

    const observer = new ResizeObserver(reset);
    observer.observe(list);
    for (const element of elements) observer.observe(element);
    return () => {
      listeners.abort();
      observer.disconnect();
      release();
      cancelAnimationFrame(frame);
      board.removeAttribute("data-rope-grip");
      for (const { style } of elements) {
        style.removeProperty("--faq-translate");
        style.removeProperty("--faq-rotate");
      }
    };
  }, [wide, reducedMotion]);

  return (
    <section className="px-5 pb-20 sm:pb-30 overflow-x-clip">
      <div className="max-w-[1299px] w-full mx-auto">
        <div className="flex flex-col items-center text-center gap-3 mb-12">
          <span className="text-xs font-medium text-ink-3 tracking-wide uppercase">First time in the hills?</span>
          <h2 className="text-2xl sm:text-[2.1rem] font-semibold text-ink tracking-tight text-balance">
            Before your first ride
          </h2>
          <p className="text-ink-3">Quick answers to what riders ask us most.</p>
        </div>

        <div
          ref={boardRef}
          className="relative isolate xl:motion-safe:[touch-action:pan-y_pinch-zoom] data-[rope-grip]:cursor-grab data-dragging:cursor-grabbing"
        >
          <canvas ref={canvasRef} aria-hidden="true" className="hidden xl:block absolute inset-x-0 -top-16 w-full h-52 pointer-events-none" />
          <ul
            ref={listRef}
            className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 xl:flex xl:items-start xl:gap-0 xl:justify-center xl:pt-16 xl:pb-10"
          >
            {FAQS.map((faq, index) => (
              <li
                key={faq.q}
                tabIndex={0}
                className="relative rounded-panel hover:z-10 focus-visible:z-20 data-dragging:z-30
                  motion-safe:transition-[scale] motion-safe:duration-200 motion-safe:ease-out
                  motion-safe:hover:scale-[1.04] motion-safe:focus-visible:scale-[1.04] motion-safe:data-dragging:scale-[1.04]
                  xl:motion-safe:cursor-grab data-dragging:cursor-grabbing xl:origin-[50%_-17px]
                  xl:[translate:var(--faq-translate,none)] xl:[rotate:var(--faq-rotate,none)]
                  xl:w-[21%] xl:shrink-0 xl:-ml-6 xl:first:ml-0 xl:bg-surface xl:p-3 xl:pb-6 xl:rounded-[18px]
                  xl:shadow-[0_14px_34px_-16px_rgba(18,22,26,0.3)]"
              >
                <span
                  aria-hidden="true"
                  className="hidden xl:block absolute -top-6 left-1/2 h-8 w-3 -translate-x-1/2 rounded-[3px] border border-[#ac875d] bg-[#d5b48b] shadow-sm after:absolute after:inset-x-px after:top-2 after:border-t after:border-[#ac875d]"
                />
                <div className={`h-full xl:h-auto rounded-panel p-5 ${faq.tint}`}>
                  <span className="tnum text-sm font-semibold text-[#8a5d00]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-medium text-ink mt-2 text-balance">{faq.q}</h3>
                  <p className="text-sm text-ink-2 leading-relaxed mt-2 text-pretty">{faq.a}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
