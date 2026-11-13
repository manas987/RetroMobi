import { useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  CalendarClock,
  ChevronRight,
  FileWarning,
  Landmark,
  MessageCircle,
  Plus,
  RotateCcw,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { Row } from "../../lib/portal";
import { istDay, rupees } from "../../lib/format";
import { bookingStage, nextAction, STAGE_TONE, type BookingStage, type Tone } from "../../lib/bookingStage";
import { useT } from "../../i18n";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { useMerchantQuery } from "./query";
import { HandoverSheet, renterName, ReturnSheet, WalkinSheet } from "./bookingActions";
import { AVAIL_ORDER, AVAIL_TONE, vehicleNow, type Staged } from "./fleet/vehicleNow";
import { BarChart, Button, Card, Chip, EmptyState, ErrorNote, LoadingRows, SERIES, StatCard, TONE } from "./ui/ui";

interface Summary {
  days: { date: string; online: number; walkin: number; onlineEarnings?: number; walkinCash?: number }[];
  totals: { online: number; walkin: number };
  money?: { paid: number; pending: number; walkinCash: number };
}

interface Reviews {
  rating: number | null;
  reviewCount: number;
  reviews: Row[];
}

interface NeedItem {
  key: string;
  icon: LucideIcon;
  text: string;
  href: string;
  tone: "bad" | "attention" | "info";
}

const DAY_MS = 86_400_000;

function OverviewBody() {
  const { token, shopId, can, myName } = useMerchantShop();
  const { t, date, time, tMaybe } = useT();
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [walkinVehicle, setWalkinVehicle] = useState<string | undefined>();
  const [handover, setHandover] = useState<Row | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);

  const now = new Date();
  const from = istDay(new Date(now.getTime() - 6 * DAY_MS));
  const to = istDay(now);
  const live = { refetchInterval: 30_000 };

  // CONFIRMED = everything not yet returned: upcoming, today, out, overdue.
  const active = useMerchantQuery<{ bookings: Row[] }>(`/shops/${shopId}/bookings?status=CONFIRMED`, token, live);
  const vehicles = useMerchantQuery<{ vehicles: Row[] }>(`/shops/${shopId}/vehicles`, token);
  const tickets = useMerchantQuery<{ tickets: Row[] }>("/tickets", token, live);
  const reviews = useMerchantQuery<Reviews>(`/shops/${shopId}/reviews`, token);
  const summary = useMerchantQuery<Summary>(`/shops/${shopId}/summary?from=${from}&to=${to}`, token);
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const isOwner = can("payouts:read");
  const payoutAccount = useMerchantQuery<Row | null>(isOwner ? "/payout-account" : null, token);

  const staged = (active.data?.bookings ?? []).map((b) => ({ b, stage: bookingStage(b, now) }));
  const count = (...s: BookingStage[]) => staged.filter((x) => s.includes(x.stage)).length;

  const openTickets = (tickets.data?.tickets ?? []).filter((tk) => tk.status !== "RESOLVED");

  const needs: NeedItem[] = [];
  for (const { b, stage } of staged) {
    if (stage === "PICKUP_LATE")
      needs.push({ key: `late-${b.id}`, icon: CalendarClock, tone: "bad", href: `/merchant/bookings?tab=late&booking=${b.id}`,
        text: t("overview.needLatePickup", { name: renterName(b), vehicle: String(b.registration_number ?? "") }) });
    if (stage === "OVERDUE")
      needs.push({ key: `over-${b.id}`, icon: RotateCcw, tone: "bad", href: `/merchant/bookings?tab=late&booking=${b.id}`,
        text: t("overview.needOverdue", { name: renterName(b), vehicle: String(b.registration_number ?? "") }) });
  }
  for (const v of vehicles.data?.vehicles ?? []) {
    if (v.verification_status === "REJECTED")
      needs.push({ key: `veh-${v.id}`, icon: Bike, tone: "attention", href: "/merchant/fleet",
        text: t("overview.needVehicleRejected", { vehicle: String(v.registration_number) }) });
  }
  const soon = istDay(new Date(now.getTime() + 30 * DAY_MS));
  for (const l of licences.data?.licences ?? []) {
    const number = String(l.licence_number ?? "");
    if (l.status !== "ACTIVE") {
      needs.push({ key: `lic-${l.id}`, icon: FileWarning, tone: "attention", href: "/merchant/shop?tab=documents",
        text: t("overview.needLicence", { number, status: tMaybe(`overview.licence_${String(l.status)}`) ?? String(l.status) }) });
    } else if (l.expires_at && String(l.expires_at).slice(0, 10) <= soon) {
      needs.push({ key: `lic-${l.id}`, icon: FileWarning, tone: "attention", href: "/merchant/shop?tab=documents",
        text: t("overview.needLicenceExpiring", { number, date: date(`${String(l.expires_at).slice(0, 10)}T12:00:00`) }) });
    }
  }
  if (isOwner && payoutAccount.isSuccess) {
    if (payoutAccount.data == null)
      needs.push({ key: "bank", icon: Landmark, tone: "attention", href: "/merchant/earnings", text: t("overview.needPayoutAccount") });
    else if (payoutAccount.data.status !== "VERIFIED")
      needs.push({ key: "bank", icon: Landmark, tone: "attention", href: "/merchant/earnings", text: t("overview.needPayoutUnverified") });
  }
  for (const tk of openTickets) {
    needs.push({ key: `tk-${tk.id}`, icon: MessageCircle, tone: "info", href: "/merchant/support",
      text: t("overview.needChat", { subject: String(tk.subject ?? t("overview.chatNoSubject")) }) });
  }

  // Today's counter work, late things first, then by the time they're due.
  const todayRows = staged
    .filter((x) => ["PICKUP_LATE", "OVERDUE", "PICKUP_TODAY", "RETURN_TODAY"].includes(x.stage))
    .map((x) => {
      const isPickup = x.stage === "PICKUP_TODAY" || x.stage === "PICKUP_LATE";
      const at = String(isPickup ? x.b.scheduled_pickup_at : x.b.scheduled_return_at);
      return { ...x, isPickup, at, late: x.stage === "PICKUP_LATE" || x.stage === "OVERDUE" };
    })
    .sort((a, b) => Number(b.late) - Number(a.late) || a.at.localeCompare(b.at));

  const late = count("OVERDUE");
  const canHandover = can("bookings:write");
  const canReturn = can("bookings:return");

  const upcoming = staged
    .filter((x) => x.stage === "UPCOMING")
    .sort((x, y) => String(x.b.scheduled_pickup_at).localeCompare(String(y.b.scheduled_pickup_at)))
    .slice(0, 12);

  return (
    // Desktop (xl+): exactly one screen. Three equal-height columns, each a
    // fixed-size card plus one card that grows into the remaining height with
    // content worth having there (coming-up bookings, which vehicle is free,
    // reviews). Empty growing cards centre their empty state. Below xl the
    // columns stack and the page scrolls.
    <div className="flex flex-col gap-4 xl:h-[calc(100dvh-3rem)]">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-ink">
            {myName ? t("overview.greeting", { name: myName.split(" ")[0]! }) : t("overview.greetingNoName")}
          </h1>
          <p className="text-sm text-ink-2">
            {t("overview.todayIs", { date: date(now, { weekday: "long", day: "numeric", month: "long" }) })}
          </p>
        </div>
        {canHandover && (
          <Button variant="primary" size="lg" icon={Plus} onClick={() => setWalkinOpen(true)} className="sm:shrink-0">
            {t("overview.newWalkin")}
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
        <StatCard icon={CalendarClock} tone="attention" label={t("overview.statPickups")} href="/merchant/bookings?tab=today"
          value={active.isSuccess ? count("PICKUP_TODAY") : null} failed={active.isError}
          caption={t("overview.statPickupsCaption")} />
        <StatCard icon={Bike} tone="info" label={t("overview.statOnRide")} href="/merchant/bookings?tab=onride"
          value={active.isSuccess ? count("ON_RIDE", "RETURN_TODAY", "OVERDUE") : null} failed={active.isError}
          caption={t("overview.statOnRideCaption")} />
        <StatCard icon={RotateCcw} tone={late > 0 ? "bad" : "good"} label={t("overview.statDueBack")} href="/merchant/bookings?tab=onride"
          value={active.isSuccess ? count("RETURN_TODAY", "OVERDUE") : null} failed={active.isError}
          caption={late > 0 ? <span className="font-semibold text-danger">{t("overview.statDueBackLate", { count: late })}</span> : t("overview.statDueBackCaption")} />
        <StatCard icon={AlertTriangle} tone={needs.length > 0 ? "attention" : "good"} label={t("overview.statNeedsYou")}
          value={active.isSuccess ? needs.length : null} failed={active.isError}
          caption={t("overview.statNeedsYouCaption")} href="#needs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)] gap-4 xl:min-h-0 xl:flex-1">
        {/* ---- column 1: today, then what's coming ---- */}
        <Card scroll title={t("overview.todayTitle")} icon={CalendarClock} className="xl:h-full"
          action={<Link href="/merchant/bookings?tab=today" className="text-sm font-medium text-ink-2 hover:text-ink">{t("common.seeAll")}</Link>}>
          {active.isPending ? <LoadingRows /> : active.isError ? (
            <ErrorNote onRetry={() => active.refetch()} />
          ) : todayRows.length === 0 && upcoming.length === 0 ? (
            <div className="flex h-full items-center justify-center"><EmptyState icon={CalendarClock} text={t("overview.todayEmpty")} /></div>
          ) : (
            <>
              {todayRows.length === 0 ? (
                <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-3">{t("overview.todayEmpty")}</p>
              ) : (
                <ul className="@container flex flex-col gap-2">
                  {todayRows.map(({ b, stage, isPickup, at, late: isLate }) => {
                    const act = nextAction(stage);
                    return (
                      <li key={String(b.id)} className={`flex flex-col gap-3 rounded-2xl border p-3 @md:flex-row @md:items-center ${isLate ? "border-danger/40 bg-danger-soft/40" : "border-line"}`}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE[STAGE_TONE[stage]].icon}`}>
                            {isPickup ? <Bike className="h-5 w-5" aria-hidden /> : <RotateCcw className="h-5 w-5" aria-hidden />}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 font-semibold text-ink">
                              <span className="truncate">{renterName(b)}</span>
                              {b.source === "OFFLINE" && <Chip tone="muted">{t("common.walkin")}</Chip>}
                            </p>
                            <p className="text-sm text-ink-2 truncate">
                              {String(b.make ?? "")} {String(b.model ?? "")} · <span className="tnum">{String(b.registration_number ?? "")}</span>
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Chip tone={STAGE_TONE[stage]}>{t(`status.stage_${stage}` as const)}</Chip>
                              <span className="tnum text-sm text-ink-3 whitespace-nowrap">
                                {isPickup ? t("overview.pickupAt", { time: time(at) }) : t("overview.returnAt", { time: time(at) })}
                              </span>
                            </div>
                          </div>
                        </div>
                        {act === "handover" && canHandover && (
                          <Button variant="primary" onClick={() => setHandover(b)} className="@md:shrink-0">
                            {b.source === "OFFLINE" ? t("actions.handoverWalkin") : t("actions.handover")}
                          </Button>
                        )}
                        {act === "return" && canReturn && (
                          <Button variant="dark" onClick={() => setReturning(b)} className="@md:shrink-0">
                            {t("actions.markReturned")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <h3 className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-ink-4">{t("overview.comingUp")}</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-ink-3">{t("overview.comingUpEmpty")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {upcoming.map(({ b }) => (
                    <li key={String(b.id)} className="flex items-center gap-3 py-2.5">
                      <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-1 leading-tight">
                        <span className="text-[11px] text-ink-3">{date(b.scheduled_pickup_at, { weekday: "short" })}</span>
                        <span className="tnum text-base font-semibold text-ink">{date(b.scheduled_pickup_at, { day: "numeric" })}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{renterName(b)}</p>
                        <p className="truncate text-xs text-ink-3">
                          {String(b.make ?? "")} {String(b.model ?? "")} · {String(b.registration_number ?? "")}
                        </p>
                      </div>
                      <span className="tnum shrink-0 text-sm text-ink-2">{time(b.scheduled_pickup_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>

        {/* ---- column 2: what needs doing, which vehicle is free ---- */}
        <div id="needs" className="scroll-mt-20 flex flex-col gap-4 xl:h-full xl:min-h-0">
          <Card scroll title={t("overview.needsTitle")} icon={AlertTriangle} className="xl:max-h-[55%]">
            {needs.length === 0 ? (
              <p className="py-2 text-sm text-ink-3">{t("overview.needsEmpty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {needs.map((n) => (
                  <li key={n.key}>
                    <Link href={n.href} className="flex min-h-11 items-center gap-3 py-1.5 text-ink hover:text-ink-2">
                      <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE[n.tone].icon}`}>
                        <n.icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="flex-1 text-sm">{n.text}</span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-ink-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <FleetNowCard vehicles={vehicles} staged={staged}
            onBook={canHandover ? (id) => { setWalkinVehicle(id); setWalkinOpen(true); } : undefined} />
        </div>

        {/* ---- column 3: money, then what customers say ---- */}
        <div className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1 xl:h-full xl:min-h-0">
          <MoneyOrRidesCard summary={summary} isOwner={isOwner} />
          <ReviewsCard reviews={reviews} />
        </div>
      </div>

      <WalkinSheet open={walkinOpen} vehicleId={walkinVehicle} onClose={() => { setWalkinOpen(false); setWalkinVehicle(undefined); }} />
      <HandoverSheet booking={handover} onClose={() => setHandover(null)} />
      <ReturnSheet booking={returning} onClose={() => setReturning(null)} />
    </div>
  );
}

function MoneyOrRidesCard({ summary, isOwner }: { summary: ReturnType<typeof useMerchantQuery<Summary>>; isOwner: boolean }) {
  const { t, date } = useT();
  const label = (d: string) => date(`${d}T12:00:00+05:30`, { weekday: "short" });

  if (summary.isPending) return <Card><LoadingRows rows={2} /></Card>;
  if (summary.isError) return <Card><ErrorNote onRetry={() => summary.refetch()} /></Card>;
  const s = summary.data;

  // Money is only in the payload for roles allowed to see it.
  if (isOwner && s.money) {
    const online = s.days.reduce((n, d) => n + (d.onlineEarnings ?? 0), 0);
    const cash = s.days.reduce((n, d) => n + (d.walkinCash ?? 0), 0);
    return (
      <Card title={t("overview.earningsTitle")} className="shrink-0"
        action={<Link href="/merchant/earnings" aria-label={t("overview.seeEarnings")} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">{t("common.seeAll")} <ArrowRight className="h-4 w-4" /></Link>}>
        <p className="tnum text-3xl font-semibold text-ink">{rupees(online + cash)}</p>
        <dl className="mt-1 mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[0] }} aria-hidden /><dt className="text-ink-3">{t("overview.earningsOnline")}</dt><dd className="tnum font-medium text-ink">{rupees(online)}</dd></div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[1] }} aria-hidden /><dt className="text-ink-3">{t("overview.earningsWalkin")}</dt><dd className="tnum font-medium text-ink">{rupees(cash)}</dd></div>
        </dl>
        <BarChart
          data={s.days.map((d) => ({ label: label(d.date), values: [d.onlineEarnings ?? 0, d.walkinCash ?? 0] }))}
          series={[t("overview.earningsOnline"), t("overview.earningsWalkin")]}
          format={(n) => rupees(n)}
          tableLabel={t("common.seeNumbers")}
          legend={false}
        />
        <p className="mt-2 text-xs text-ink-3">{t("overview.earningsCaption")}</p>
      </Card>
    );
  }

  const total = s.totals.online + s.totals.walkin;
  return (
    <Card title={t("overview.ridesTitle")} className="shrink-0">
      <p className="tnum text-3xl font-semibold text-ink mb-3">{t("overview.ridesTotal", { count: total })}</p>
      <BarChart
        data={s.days.map((d) => ({ label: label(d.date), values: [d.online, d.walkin] }))}
        series={[t("common.online"), t("common.walkin")]}
        tableLabel={t("common.seeNumbers")}
      />
    </Card>
  );
}


/**
 * The fleet as the counter needs it when a walk-in arrives: which scooter can
 * go out right now, until when, and at what price -- with a Book button on the
 * free ones. Listing health lives on the Vehicles page; a rejected vehicle
 * already shows up under "Needs your attention".
 */
function FleetNowCard({
  vehicles,
  staged,
  onBook,
}: {
  vehicles: ReturnType<typeof useMerchantQuery<{ vehicles: Row[] }>>;
  staged: Staged[];
  onBook?: (vehicleId: string) => void;
}) {
  const { t, date, time } = useT();
  const today = istDay(new Date());
  // Today's times as "7:00 pm", anything later as "Sat 15".
  const when = (iso: unknown) =>
    istDay(new Date(String(iso))) === today ? time(iso) : date(iso, { weekday: "short", day: "numeric" });

  const body = () => {
    if (vehicles.isPending) return <LoadingRows rows={3} />;
    if (vehicles.isError) return <ErrorNote onRetry={() => vehicles.refetch()} />;
    const list = vehicles.data.vehicles;
    if (list.length === 0) {
      return (
        <div className="flex h-full items-center justify-center">
          <EmptyState icon={Bike} text={t("overview.fleetEmpty")}
            action={<Link href="/merchant/fleet" className="inline-flex min-h-11 items-center rounded-2xl bg-amber px-4 text-sm font-semibold text-on-amber">{t("overview.addFirstVehicle")}</Link>} />
        </div>
      );
    }

    const rows = list
      .map((v) => {
        const { avail: a, out, goes, next, missed } = vehicleNow(v.id, staged);
        const price = v.amount == null ? t("overview.noPrice") : t("common.perDay", { amount: rupees(Number(v.amount)) });
        const detail =
          a === "OUT" ? t("overview.backAt", { when: when(out!.b.scheduled_return_at) })
          : missed ? t("overview.missedAt", { when: when(goes!.b.scheduled_pickup_at) })
          : a === "TODAY" ? t("overview.goesAt", { when: when(goes!.b.scheduled_pickup_at) })
          : next ? `${price} · ${t("overview.nextBooking", { when: when(next.b.scheduled_pickup_at) })}`
          : price;
        return { v, a, detail, late: out?.stage === "OVERDUE", missed };
      })
      .sort((x, y) => AVAIL_ORDER[x.a] - AVAIL_ORDER[y.a]);

    const tally = [
      ...(["FREE", "TODAY", "OUT"] as const).map((a) => ({
        a: a as string,
        tone: AVAIL_TONE[a] as Tone,
        label: t(`overview.avail_${a}` as const),
        n: rows.filter((r) => r.a === a && !r.missed).length,
      })),
      { a: "MISSED", tone: "bad" as Tone, label: t("status.stage_PICKUP_LATE"), n: rows.filter((r) => r.missed).length },
    ].filter((x) => x.a !== "MISSED" || x.n > 0);

    return (
      <>
        {/* Availability at a glance: one bar, three states, labelled. */}
        <div className="mb-1 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {tally.filter((x) => x.n > 0).map((x) => (
            <span key={x.a} className={TONE[x.tone].dot} style={{ flexGrow: x.n }} />
          ))}
        </div>
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
          {tally.map((x) => (
            <li key={x.a} className="flex items-center gap-1.5 text-xs text-ink-2 whitespace-nowrap">
              <span className={`h-2 w-2 rounded-full ${TONE[x.tone].dot}`} aria-hidden />
              <span className="tnum font-semibold text-ink">{x.n}</span>
              {x.label}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col divide-y divide-line">
          {rows.map(({ v, a, detail, late, missed }) => {
            const name = `${String(v.make ?? "")} ${String(v.model ?? "")}`.trim();
            return (
              <li key={String(v.id)} className="flex items-center gap-3 py-2.5">
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[late || missed ? "bad" : AVAIL_TONE[a]].icon}`}>
                  <Bike className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{name}</p>
                  <p className="truncate text-xs text-ink-3">
                    <span className="tnum">{String(v.registration_number ?? "")}</span> · <span className={late || missed ? "font-semibold text-danger" : ""}>{detail}</span>
                  </p>
                </div>
                {a === "FREE" && onBook && v.amount != null ? (
                  <Button className="min-h-9 shrink-0 px-3" onClick={() => onBook(String(v.id))} aria-label={t("overview.bookVehicle", { vehicle: name })}>
                    {t("overview.book")}
                  </Button>
                ) : (
                  <Chip tone={late || missed ? "bad" : AVAIL_TONE[a]}>
                    {late ? t("status.stage_OVERDUE") : missed ? t("status.stage_PICKUP_LATE") : t(`overview.avail_${a}` as const)}
                  </Chip>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  return (
    <Card scroll title={t("overview.fleetNow")} icon={Bike} className="xl:flex-1"
      action={<Link href="/merchant/fleet" className="shrink-0 text-sm font-medium text-ink-2 hover:text-ink">{t("common.seeAll")}</Link>}>
      {body()}
    </Card>
  );
}

function ReviewsCard({ reviews }: { reviews: ReturnType<typeof useMerchantQuery<Reviews>> }) {
  const { t, date } = useT();
  if (reviews.isPending) return <Card><LoadingRows rows={2} /></Card>;
  if (reviews.isError) return <Card><ErrorNote onRetry={() => reviews.refetch()} /></Card>;
  const r = reviews.data;

  return (
    <Card scroll title={t("overview.reviewsTitle")} icon={Star} className="xl:flex-1">
      {r.reviewCount === 0 ? (
        <div className="flex h-full items-center justify-center"><EmptyState icon={Star} text={t("overview.reviewsEmpty")} /></div>
      ) : (
        <>
          <p className="mb-4 flex items-center gap-2 text-sm text-ink-2">
            <Stars rating={r.rating ?? 0} />
            {t(r.reviewCount === 1 ? "overview.reviewsSummary_one" : "overview.reviewsSummary", { rating: (r.rating ?? 0).toFixed(1), count: r.reviewCount })}
          </p>
          <ul className="flex flex-col gap-3">
            {r.reviews.slice(0, 5).map((rv) => (
              <li key={String(rv.id)} className="rounded-2xl bg-surface-2 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Stars rating={Number(rv.rating)} />
                  <span className="text-xs text-ink-3">{date(rv.created_at)}</span>
                </div>
                {rv.comment != null && <p className="mt-1.5 text-sm text-ink">{String(rv.comment)}</p>}
                <p className="mt-1 text-xs text-ink-3">
                  {String(rv.reviewer_name ?? t("overview.anonymous"))} · {String(rv.registration_number ?? "")}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-4 w-4 ${i <= Math.round(rating) ? "fill-amber text-amber-edge" : "text-line-strong"}`} aria-hidden />
      ))}
    </span>
  );
}

export function MerchantOverview() {
  return (
    <MerchantLayout>
      <OverviewBody />
    </MerchantLayout>
  );
}
