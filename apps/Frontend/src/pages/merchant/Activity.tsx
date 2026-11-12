import { Fragment } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Bike, CalendarCheck, History } from "lucide-react";
import { handleSessionExpiry, portalFetch, PortalApiError, type Row } from "../../lib/portal";
import { istDay } from "../../lib/format";
import { useT } from "../../i18n";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { useMerchantQuery, useUrlParam, useUrlString } from "./query";
import { Button, Card, Chip, DayHeading, EmptyState, ErrorNote, INPUT, LoadingRows, PageHeader } from "./ui/ui";
import { activityText, actorName, type ActivityItem } from "./staff/activityText";
import { Avatar } from "./staff/MemberCard";
import type { Role } from "./staff/RoleCards";

const KINDS = ["all", "bookings", "vehicles", "staff", "shop"] as const;

export function MerchantActivity() {
  return (
    <MerchantLayout>
      <ActivityBody />
    </MerchantLayout>
  );
}

function ActivityBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t, time } = useT();
  const [kind, setKind] = useUrlParam("kind", KINDS, "all");
  const [actorId, setActorId] = useUrlString("person");
  const allowed = can("members:read");

  const members = useMerchantQuery<{ members: Row[] }>(allowed && shopId ? `/shops/${shopId}/members` : null, token);

  const filters = new URLSearchParams();
  if (kind !== "all") filters.set("kind", kind);
  if (actorId) filters.set("actorId", actorId);
  const path = `/shops/${shopId}/activity?${filters}`;

  const q = useInfiniteQuery<{ items: ActivityItem[]; nextBefore: string | null }, Error, { pages: { items: ActivityItem[]; nextBefore: string | null }[] }, unknown[], string | null>({
    queryKey: ["merchant", path],
    initialPageParam: null,
    enabled: allowed && !!shopId,
    queryFn: async ({ pageParam }) => {
      try {
        return await portalFetch("merchant", pageParam ? `${path}&before=${encodeURIComponent(pageParam)}` : path, { token });
      } catch (err) {
        handleSessionExpiry("merchant", err);
        throw err;
      }
    },
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    retry: (count, err) => !(err instanceof PortalApiError && err.status < 500) && count < 2,
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const days: { day: string; items: ActivityItem[] }[] = [];
  for (const it of items) {
    const day = istDay(new Date(it.created_at));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(it);
    else days.push({ day, items: [it] });
  }

  return (
    <div className="@container">
      <PageHeader title={t("nav.activity")} subtitle={t("staff.activitySubtitle")} />
      {!allowed ? (
        <Card><p className="text-base text-ink-2">{t("staff.noAccess")}</p></Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <select aria-label={t("staff.person")} className={`${INPUT} min-h-11 flex-1 @md:w-56 @md:flex-none`} value={actorId ?? ""} onChange={(e) => setActorId(e.target.value || null)}>
              <option value="">{t("staff.everyone")}</option>
              {(members.data?.members ?? []).map((m) => (
                <option key={String(m.id)} value={String(m.merchant_user_id)}>{String(m.name ?? "") || String(m.phone)}</option>
              ))}
            </select>
            <select aria-label={t("staff.kind")} className={`${INPUT} min-h-11 flex-1 @md:w-56 @md:flex-none`} value={kind} onChange={(e) => setKind(e.target.value === "all" ? null : (e.target.value as (typeof KINDS)[number]))}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{t(`staff.kind_${k}`)}</option>
              ))}
            </select>
          </div>

          {q.isPending ? (
            <LoadingRows />
          ) : q.isError ? (
            <ErrorNote onRetry={() => void q.refetch()} />
          ) : items.length === 0 ? (
            <Card><EmptyState icon={History} text={t("staff.activityEmpty")} /></Card>
          ) : (
            <Card>
              {days.map((d) => (
                <Fragment key={d.day}>
                  <DayHeading day={d.day} />
                  <ul className="flex flex-col divide-y divide-line">
                    {d.items.map((it) => (
                      <li key={it.id} className="flex items-center gap-3 py-3">
                        <span className="tnum w-16 shrink-0 text-sm text-ink-3">{time(it.created_at)}</span>
                        <span className="hidden @md:block"><Avatar name={actorName(it, t)} /></span>
                        <p className="min-w-0 flex-1 text-base text-ink">{activityText(it, t)}</p>
                        {it.actor_type === "MERCHANT" && it.actor_role && (
                          <span className="hidden @md:inline"><Chip tone="muted">{t(`common.role_${it.actor_role as Role}`)}</Chip></span>
                        )}
                        {it.booking_id ? (
                          <Link href={`/merchant/bookings?booking=${it.booking_id}`} aria-label={t("staff.openBooking")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-2 hover:bg-surface-3">
                            <CalendarCheck className="h-5 w-5" aria-hidden />
                          </Link>
                        ) : it.vehicle_id ? (
                          <Link href={`/merchant/fleet/${it.vehicle_id}`} aria-label={t("staff.openVehicle")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-ink-2 hover:bg-surface-3">
                            <Bike className="h-5 w-5" aria-hidden />
                          </Link>
                        ) : (
                          <span className="h-11 w-11 shrink-0" />
                        )}
                      </li>
                    ))}
                  </ul>
                </Fragment>
              ))}
              {q.hasNextPage && (
                <Button variant="secondary" className="mt-4 self-center" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                  {t("common.showOlder")}
                </Button>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
