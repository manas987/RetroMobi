import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "wouter";
import { AlertCircle, Bike, Building2, CheckCircle2, Circle, Clock, FileText, Info, ScrollText, type LucideIcon } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ErrorNote, LoadingRows, Select, Sheet } from "../ui/ui";
import type { DocState, DocType, SetupData, SetupPaper } from "../setup/GetListedChip";
import { newestByType, PaperActions, PaperSlot, paperStatus, STATUS_TONE } from "./PaperSlot";

const VEHICLE_DOCS: DocType[] = ["RC", "INSURANCE", "PERMIT", "PUC", "FITNESS", "TAX"];
/** Same columns on every table, so the categories line up down the page. */
const COLS = "@2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_9rem_minmax(17.5rem,1.4fr)]";

/**
 * Every paper this shop has, grouped the way the licence rules group them:
 * the transport licence, this shop's own papers, the business papers all
 * shops share, and each vehicle's papers. What's still needed to get listed is
 * the setup guide's job; this page is for seeing and managing what's there.
 */
export function ShopPapersTab({ shopId }: { shopId: string }) {
  const { token, can } = useMerchantShop();
  const { t } = useT();
  const [params] = useSearchParams();
  const setup = useMerchantQuery<SetupData>(`/shops/${shopId}/setup`, token);
  const docs = useMerchantQuery<{ documents: Row[] }>(`/shops/${shopId}/documents`, token);
  const business = useMerchantQuery<{ documents: Row[] }>("/merchant-documents", token);
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const [open, setOpen] = useState<{ type: string; base: string; title: string; hint?: string; required: boolean } | "LICENCE" | null>(null);
  const write = can("shop:write");

  if (setup.isPending || docs.isPending) return <LoadingRows rows={5} />;
  if (setup.isError || docs.isError) return <ErrorNote onRetry={() => { void setup.refetch(); void docs.refetch(); }} />;

  const shopRows = newestByType(docs.data.documents);
  const businessRows = newestByType(business.data?.documents);
  const { papers, licence, vehicles } = setup.data;
  // A licence only counts for this shop once it's linked to it. Someone without
  // their own licences (a manager) can't see links, so they get the setup status.
  const covering = (licences.data?.licences ?? []).filter((l) => ((l.shops ?? []) as { id?: string }[]).some((x) => String(x.id) === shopId));
  const ownsLicences = (licences.data?.licences.length ?? 0) > 0;

  const paperRows = (list: SetupPaper[], rows: Map<string, Row>, base: string) =>
    list.map((p) => {
      const title = t(`shop.paper_${p.type}` as TKey);
      const hint = HINTS[p.type] && t(HINTS[p.type]!);
      return (
        <PaperRow key={p.type} title={title} required={p.required} row={rows.get(p.type)} fallback={p.state} note={p.note}
          action={(r) => r ? <PaperActions compact row={r} base={base} title={title} canWrite={write} />
            : write && <Button onClick={() => setOpen({ type: p.type, base, title, hint, required: p.required })}>{t("shop.upload")}</Button>} />
      );
    });

  return (
    <div className="flex flex-col gap-4">
      {params.get("new") && (
        <p className="flex gap-2 rounded-2xl bg-info-soft p-3 text-sm text-info">
          <Info className="h-5 w-5 shrink-0" aria-hidden />
          <span>{t("shop.newShopNote")}</span>
        </p>
      )}

      <Section icon={ScrollText} title={t("shop.group_licence")} hint={t("shop.group_licenceHint")}
        action={write && ownsLicences && <Button variant="ghost" onClick={() => setOpen("LICENCE")}>{covering.length ? t("shop.change") : t("shop.linkLicence")}</Button>}>
        {covering.length > 0 ? covering.map((l) => (
          <PaperRow key={String(l.id)} title={t("shop.group_licence")} required row={{ ...l, document_number: l.licence_number }} statusOnly />
        )) : (
          <PaperRow title={t("shop.group_licence")} required fallback={ownsLicences ? "NOT_LINKED" : licence.status === "NONE" ? "MISSING" : licence.status}
            action={() => write && (ownsLicences
              ? <Button onClick={() => setOpen("LICENCE")}>{t("shop.linkLicence")}</Button>
              : <Link href="/merchant/papers" className="inline-flex min-h-11 items-center rounded-2xl border border-line px-4 text-sm font-semibold text-ink hover:bg-surface-2">{t("shop.addLicence")}</Link>)} />
        )}
      </Section>

      <Section icon={Building2} title={t("shop.thisShopPapers")} hint={t("shop.thisShopPapersHint")}>
        {paperRows(papers.shop, shopRows, `/shops/${shopId}/documents`)}
      </Section>

      <Section icon={FileText} title={t("shop.businessPapers")} hint={t("shop.businessPapersHint")}>
        {paperRows(papers.business, businessRows, "/merchant-documents")}
      </Section>

      <Card title={<span className="flex items-center gap-2"><Bike className="h-5 w-5 text-ink-3" aria-hidden />{t("shop.vehiclePapers")}</span>}>
        <p className="-mt-1 mb-3 text-sm text-ink-3">{t("shop.vehiclePapersHint")}</p>
        {vehicles.length === 0 ? <p className="text-sm text-ink-2">{t("shop.noVehicles")}</p> : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                  <th className="py-2 pr-3 font-semibold">{t("shop.colVehicle")}</th>
                  {VEHICLE_DOCS.map((d) => <th key={d} className="px-2 py-2 text-center font-semibold">{t(`shop.vdoc_${d}` as TKey)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="py-2.5 pr-3">
                      <Link href={`/merchant/fleet/${v.id}?tab=documents`} className="block font-semibold text-ink hover:underline">{v.make} {v.model}</Link>
                      <span className="tnum text-xs text-ink-3">{v.registrationNumber}</span>
                    </td>
                    {VEHICLE_DOCS.map((d) => (
                      <td key={d} className="px-2 py-2.5 text-center">
                        {v.requiredDocs.includes(d) ? <StateMark state={v.docs[d]?.state ?? "MISSING"} /> : <span className="text-ink-3" title={t("shop.notNeeded")}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          {(["VERIFIED", "PENDING", "REJECTED", "MISSING"] as const).map((s) => <span key={s} className="flex items-center gap-1"><StateMark state={s} />{t(`shop.mark_${s}`)}</span>)}
          <span>— {t("shop.notNeeded")}</span>
        </p>
      </Card>

      <Sheet open={open != null} onClose={() => setOpen(null)} title={open === "LICENCE" ? t("shop.group_licence") : open?.title ?? ""}>
        {open === "LICENCE" ? <LicencePicker shopId={shopId} /> : open && (
          <PaperSlot type={open.type} base={open.base} title={open.title} hint={open.hint} required={open.required} canWrite={write} bare />
        )}
      </Sheet>
    </div>
  );
}

const HINTS: Record<string, TKey> = {
  SHOP_ACT: "shop.group_shopActHint", PREMISES: "shop.group_premisesHint", LANDLORD_NOC: "shop.hint_LANDLORD_NOC",
  GSTIN: "shop.hint_GSTIN", UDYAM: "shop.hint_UDYAM",
};

function Section({ icon: Icon, title, hint, action, children }: { icon: LucideIcon; title: string; hint: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useT();
  return (
    <Card title={<span className="flex items-center gap-2"><Icon className="h-5 w-5 text-ink-3" aria-hidden />{title}</span>} action={action || undefined}>
      <p className="-mt-1 mb-2 text-sm text-ink-3">{hint}</p>
      <div className={`hidden gap-3 border-b border-line py-2 text-xs font-semibold uppercase tracking-wide text-ink-3 @2xl:grid ${COLS}`}>
        <span>{t("shop.colPaper")}</span><span>{t("shop.paperNumber")}</span><span>{t("shop.colValidTill")}</span><span>{t("shop.colStatus")}</span><span />
      </div>
      <ul className="divide-y divide-line">{children}</ul>
    </Card>
  );
}

/**
 * One paper as a table row on wide screens, a small card on phones. `row` is
 * the uploaded record when this person can see it; otherwise `fallback` is the
 * state the setup check reports (a manager sees the owner's business papers that way).
 */
function PaperRow(p: {
  title: string; required: boolean; row?: Row; fallback?: string; note?: string | null; action?: (row?: Row) => ReactNode;
  /** The licence's status is RetroMobi's check of the licence itself, file or not. */
  statusOnly?: boolean;
}) {
  const { t, tMaybe, date } = useT();
  const r = p.row;
  const state = r ? (p.statusOnly ? String(r.status) : paperStatus(r) ?? "NO_FILE") : p.fallback ?? "MISSING";
  const number = r?.document_number ? String(r.document_number) : "—";
  const till = r?.expires_at ? date(String(r.expires_at).slice(0, 10) + "T12:00:00+05:30", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const chip = state === "NOT_LINKED" ? <Chip tone="attention">{t("shop.notLinked")}</Chip>
    : state === "NO_FILE" ? <Chip tone="muted">{t("fleet.noFile")}</Chip>
    : state === "MISSING" || state === "NONE" ? <Chip tone={p.required ? "attention" : "muted"}>{t("shop.notAdded")}</Chip>
    : <Chip tone={STATUS_TONE[state] ?? "muted"}>{tMaybe(`shop.status_${state}`) ?? t("shop.status_OTHER")}</Chip>;
  return (
    <li className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3 ${COLS}`}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{p.title}</span>
        <span className="block text-xs text-ink-3">{p.required ? t("shop.neededToList") : t("common.optional")}</span>
        <span className="block text-xs text-ink-3 @2xl:hidden">{[number !== "—" && number, till !== "—" && t("shop.validTill", { date: till })].filter(Boolean).join(" · ")}</span>
        <span className="mt-1.5 block @2xl:hidden">{chip}</span>
      </span>
      <span className="tnum hidden truncate text-sm text-ink-2 @2xl:block">{number}</span>
      <span className="tnum hidden text-sm text-ink-2 @2xl:block">{till}</span>
      <span className="hidden @2xl:block">{chip}</span>
      <span className="flex justify-end">{p.action?.(r)}</span>
      {state === "REJECTED" && p.note && <p className="col-span-full rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{p.note}</p>}
    </li>
  );
}

const MARKS: Record<string, { icon: LucideIcon; cls: string }> = {
  VERIFIED: { icon: CheckCircle2, cls: "text-verified" },
  PENDING: { icon: Clock, cls: "text-info" },
  REJECTED: { icon: AlertCircle, cls: "text-danger" },
  EXPIRED: { icon: AlertCircle, cls: "text-danger" },
  MISSING: { icon: Circle, cls: "text-ink-3" },
};

function StateMark({ state }: { state: DocState }) {
  const { t } = useT();
  const m = MARKS[state] ?? MARKS.MISSING!;
  const label = t(`shop.mark_${state === "EXPIRED" ? "REJECTED" : state}` as TKey);
  return <m.icon className={`inline h-4 w-4 ${m.cls}`} aria-label={label}><title>{label}</title></m.icon>;
}

/**
 * One transport licence covers the main shop and its branches once the
 * transport office lists the branch, so the question is which licence lists
 * this shop. `/licences` is the signed-in person's own.
 */
function LicencePicker({ shopId }: { shopId: string }) {
  const { token, can, reloadShops } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = can("shop:write");
  const covers = (l: Row) => ((l.shops ?? []) as { id?: string }[]).some((x) => String(x.id) === shopId);
  const all = licences.data?.licences ?? [];
  const used = all.filter(covers);
  const unused = all.filter((l) => !covers(l));

  async function link(l: Row) {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", covers(l) ? `/licences/${l.id}/shops/${shopId}` : `/licences/${l.id}/shops`,
        covers(l) ? { method: "DELETE", token } : { method: "POST", token, body: { shopId } });
      reloadShops();
      await invalidate();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  if (licences.isPending) return <LoadingRows rows={2} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">{t("shop.group_licenceHint")}</p>
      {used.length > 0 && (
        <ul className="flex flex-col gap-2">
          {used.map((l) => (
            <li key={String(l.id)} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 truncate text-ink"><CheckCircle2 className="h-4 w-4 shrink-0 text-verified" aria-hidden />{String(l.licence_number)}</span>
              {write && <Button variant="ghost" disabled={busy} onClick={() => link(l)}>{t("shop.detach")}</Button>}
            </li>
          ))}
        </ul>
      )}
      {write && unused.length > 0 && (
        <div className="flex gap-2">
          <Select compact className="flex-1" ariaLabel={t("shop.whichLicence")} placeholder={t("shop.whichLicence")} value={pick} onChange={setPick}
            options={unused.map((l) => ({ value: String(l.id), label: String(l.licence_number) }))} />
          <Button variant="primary" disabled={busy || !pick} onClick={() => { const l = unused.find((x) => String(x.id) === pick); if (l) { setPick(""); void link(l); } }}>{t("shop.attach")}</Button>
        </div>
      )}
      {write && all.length === 0 && (
        <Link href="/merchant/papers" className="text-sm font-semibold text-ink underline underline-offset-2">{t("shop.addLicenceLink")}</Link>
      )}
      {error && <ErrorNote text={error} />}
    </div>
  );
}
