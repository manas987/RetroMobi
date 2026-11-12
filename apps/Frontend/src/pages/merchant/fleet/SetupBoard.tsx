import { useState } from "react";
import { Link } from "wouter";
import { Bike, CheckCircle2, Rocket, XCircle } from "lucide-react";
import { portalFetch } from "../../../lib/portal";
import type { Tone } from "../../../lib/bookingStage";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, ErrorNote, LoadingRows, TONE } from "../ui/ui";

export type ListingStage = "NEEDS_INFO" | "NEEDS_FIXING" | "CHECKING" | "READY" | "SHOWING";

export interface SetupVehicle {
  id: string;
  make: string;
  model: string;
  registrationNumber: string;
  rejectionNote: string | null;
  priceSet: boolean;
  missing: string[];
  docs: Record<string, { state: string; id: string | null; note: string | null }>;
  stage: ListingStage;
  canSubmit: boolean;
  waitingFor: string[];
}

export interface SetupData {
  steps: { shop: boolean; licence: boolean; vehicles: boolean; payout: boolean; submitted: boolean };
  done: boolean;
  minVehiclesForShop: number;
  completeVehicles: number;
  vehicles: SetupVehicle[];
}

export const STAGES: ListingStage[] = ["NEEDS_INFO", "NEEDS_FIXING", "CHECKING", "READY", "SHOWING"];
export const STAGE_TONE: Record<ListingStage, Tone> = {
  NEEDS_INFO: "muted",
  NEEDS_FIXING: "bad",
  CHECKING: "info",
  READY: "attention",
  SHOWING: "good",
};

/** Setup state for every vehicle at this shop (same cached request as the wizard). */
export function useSetup() {
  const { token, shopId } = useMerchantShop();
  return useMerchantQuery<SetupData>(shopId ? `/shops/${shopId}/setup` : null, token);
}

export function useVehicles() {
  const { token, shopId } = useMerchantShop();
  return useMerchantQuery<{ vehicles: Record<string, unknown>[] }>(shopId ? `/shops/${shopId}/vehicles` : null, token);
}

/** Turn a vehicle on or off for customers, or send it to RetroMobi for checking. */
export function useListingActions() {
  const { token } = useMerchantShop();
  const { lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, method: "PATCH" | "POST", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", path, { method, token, body });
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    setActive: (id: string, active: boolean) => run(`/vehicles/${id}`, "PATCH", { status: active ? "ACTIVE" : "INACTIVE" }),
    sendForChecking: (id: string) => run(`/vehicles/${id}/verification`, "POST"),
  };
}

const ITEMS = ["price", "photo", "doc:RC", "doc:INSURANCE", "doc:PUC"] as const;
const ITEM_LABEL: Record<(typeof ITEMS)[number], TKey> = {
  price: "fleet.item_price",
  photo: "fleet.item_photo",
  "doc:RC": "fleet.item_RC",
  "doc:INSURANCE": "fleet.item_INSURANCE",
  "doc:PUC": "fleet.item_PUC",
};
export const DOC_LABEL: Record<string, TKey> = {
  RC: "fleet.doc_RC",
  INSURANCE: "fleet.doc_INSURANCE",
  PUC: "fleet.doc_PUC",
  FITNESS: "fleet.doc_FITNESS",
  PERMIT: "fleet.doc_PERMIT",
  TAX: "fleet.doc_TAX",
};

/** Why RetroMobi sent a vehicle back: the vehicle note, else the first bad paper. */
function fixReason(v: SetupVehicle, t: ReturnType<typeof useT>["t"]) {
  if (v.rejectionNote) return v.rejectionNote;
  const bad = Object.entries(v.docs).find(([, d]) => d.state === "REJECTED" || d.state === "EXPIRED");
  if (!bad) return t("fleet.fixGeneric");
  const [type, d] = bad;
  return d.state === "EXPIRED" ? t("fleet.docExpired", { doc: t(DOC_LABEL[type]!) }) : (d.note ?? t("fleet.fixGeneric"));
}

/**
 * What a vehicle needs to get on RetroMobi, and the one button for its stage.
 * Used on the Get listed board and on the vehicle page.
 */
export function ListingBox({ v, itemHref }: { v: SetupVehicle; itemHref?: (item: string) => string }) {
  const { can } = useMerchantShop();
  const { t } = useT();
  const act = useListingActions();
  const write = can("fleet:write");
  const setupHref = `/merchant/setup?vehicle=${v.id}`;

  return (
    <div className="flex flex-col gap-3">
      {v.stage === "NEEDS_INFO" && (
        <>
          <ul className="flex flex-col gap-1.5">
            {ITEMS.map((item) => {
              const missing = v.missing.includes(item);
              const label = (
                <span className={`flex items-center gap-2 text-sm ${missing ? "text-ink" : "text-ink-3"}`}>
                  {missing ? <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-verified" aria-hidden />}
                  {t(ITEM_LABEL[item])}
                </span>
              );
              return (
                <li key={item}>
                  {missing && itemHref ? <Link href={itemHref(item)} className="block hover:underline">{label}</Link> : label}
                </li>
              );
            })}
          </ul>
          {write && (
            <div className="flex flex-col gap-2">
              <Link href={setupHref} className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-3">
                {t("fleet.addThese")}
              </Link>
              {v.canSubmit && (
                <Button variant="primary" disabled={act.busy} onClick={() => act.sendForChecking(v.id)}>{t("fleet.sendForChecking")}</Button>
              )}
            </div>
          )}
        </>
      )}

      {v.stage === "NEEDS_FIXING" && (
        <>
          <p className="rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">{fixReason(v, t)}</p>
          {write && (
            <Link href={setupHref} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-amber px-4 text-sm font-semibold text-on-amber hover:bg-amber-edge">
              {t("fleet.fix")}
            </Link>
          )}
        </>
      )}

      {v.stage === "CHECKING" && (
        <>
          <p className="text-sm text-ink-2">{t("fleet.checkingText")}</p>
          {v.waitingFor.includes("shop") && <p className="text-sm font-medium text-info">{t("fleet.waitingShop")}</p>}
          {v.waitingFor.includes("licence") && <p className="text-sm font-medium text-info">{t("fleet.waitingLicence")}</p>}
        </>
      )}

      {v.stage === "READY" && (
        <>
          <p className="text-sm text-ink-2">{t("fleet.readyText")}</p>
          {write && <Button variant="primary" disabled={act.busy} onClick={() => act.setActive(v.id, true)}>{t("fleet.showOn")}</Button>}
        </>
      )}

      {v.stage === "SHOWING" && (
        <>
          <p className="text-sm font-medium text-verified">{t("fleet.showingText")}</p>
          {write && <Button disabled={act.busy} onClick={() => act.setActive(v.id, false)}>{t("fleet.hideFrom")}</Button>}
        </>
      )}

      {act.error && <ErrorNote text={act.error} />}
    </div>
  );
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-sm text-ink-2 whitespace-nowrap">
      {ok ? <CheckCircle2 className="h-4 w-4 text-verified" aria-hidden /> : <XCircle className="h-4 w-4 text-danger" aria-hidden />}
      {label}
    </li>
  );
}

/** The "Get listed" view: shop-level progress on top, then every vehicle in its stage column. */
export function SetupBoard() {
  const { can } = useMerchantShop();
  const { t } = useT();
  const setup = useSetup();

  if (setup.isPending) return <LoadingRows rows={4} />;
  if (setup.isError) return <ErrorNote onRetry={() => setup.refetch()} />;
  const s = setup.data;

  return (
    <div className="@container flex flex-col gap-4">
      {!s.done && (
        <Card title={t("fleet.boardTitle")} icon={Rocket}
          action={can("shop:write") || can("fleet:write") ? (
            <Link href="/merchant/setup" className="inline-flex min-h-11 items-center rounded-2xl bg-amber px-4 text-sm font-semibold text-on-amber hover:bg-amber-edge">
              {t("fleet.continueSetup")}
            </Link>
          ) : undefined}>
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5">
            <Mark ok={s.steps.shop} label={t("fleet.stepShop")} />
            <Mark ok={s.steps.licence} label={t("fleet.stepLicence")} />
            <Mark ok={s.steps.payout} label={t("fleet.stepBank")} />
            <Mark ok={s.steps.submitted} label={t("fleet.stepSent")} />
          </ul>
          <p className="text-sm text-ink-2">{t("fleet.readyCount", { n: s.completeVehicles, min: s.minVehiclesForShop })}</p>
        </Card>
      )}

      {s.vehicles.length === 0 && (
        <Card>
          <p className="py-4 text-center text-sm text-ink-2">{t("fleet.boardEmpty")}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 @6xl:grid-cols-5">
        {STAGES.map((stage) => {
          const list = s.vehicles.filter((v) => v.stage === stage);
          return (
            <section key={stage} className="flex min-w-0 flex-col gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className={`h-2.5 w-2.5 rounded-full ${TONE[STAGE_TONE[stage]].dot}`} aria-hidden />
                {t(`fleet.stage_${stage}` as const)}
                <span className="tnum text-ink-3">{list.length}</span>
              </h3>
              {list.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-line px-3 py-6 text-center text-sm text-ink-3">{t("fleet.nothingHere")}</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-1">
                {list.map((v) => (
                  <div key={v.id} className="rounded-card bg-surface p-4 shadow-card">
                    <Link href={`/merchant/fleet/${v.id}`} className="mb-3 flex items-center gap-3 hover:opacity-80">
                      <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${TONE[STAGE_TONE[stage]].icon}`}>
                        <Bike className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{v.make} {v.model}</span>
                        <span className="tnum block truncate text-xs text-ink-3">{v.registrationNumber}</span>
                      </span>
                    </Link>
                    <ListingBox v={v} />
                  </div>
                ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
