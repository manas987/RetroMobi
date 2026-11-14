import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "wouter";
import { CheckCircle2, ChevronRight, Info } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ErrorNote, LoadingRows, Select, Sheet, TONE } from "../ui/ui";
import type { SetupData, SetupPaper } from "../setup/GetListedChip";
import { newestByType, PaperSlot, STATUS_TONE } from "./PaperSlot";

type Item = {
  key: string;
  title: string;
  hint: string;
  /** Shown under the title when there's something to say (which licence, which number). */
  detail?: string;
  state: string;
  required: boolean;
  /** Business-wide papers are uploaded on Licence & papers, not here. */
  shared?: boolean;
};

const IN = ["PENDING", "VERIFIED", "ACTIVE"];

/**
 * This shop's papers as one checklist, in the order of the licence rules.
 * Each row is one line with its status and one button; the form for a paper
 * opens in a sheet, so the page stays a list you can read at a glance.
 */
export function ShopPapersTab({ shopId }: { shopId: string }) {
  const { token, can } = useMerchantShop();
  const { t, tMaybe } = useT();
  const [params] = useSearchParams();
  const setup = useMerchantQuery<SetupData>(`/shops/${shopId}/setup`, token);
  const docs = useMerchantQuery<{ documents: Row[] }>(`/shops/${shopId}/documents`, token);
  const licences = useMerchantQuery<{ licences: Row[] }>("/licences", token);
  const [open, setOpen] = useState<string | null>(null);
  const write = can("shop:write");

  if (setup.isPending || docs.isPending) return <LoadingRows rows={5} />;
  if (setup.isError || docs.isError) return <ErrorNote onRetry={() => { void setup.refetch(); void docs.refetch(); }} />;

  const newest = newestByType(docs.data.documents);
  const { papers, licence } = setup.data;
  const find = (list: SetupPaper[], type: string) => list.find((p) => p.type === type);
  // A licence only counts for this shop once it's linked to it. Someone without
  // their own licences (a manager) can't see links, so they get the setup status.
  const covering = (licences.data?.licences ?? []).filter((l) => ((l.shops ?? []) as { id?: string }[]).some((x) => String(x.id) === shopId));
  const ownsLicences = (licences.data?.licences.length ?? 0) > 0;
  const licenceState = ownsLicences && covering.length === 0 ? "NOT_LINKED" : licence.status === "NONE" ? "MISSING" : licence.status;

  const shopItem = (type: string, hint: string): Item => {
    const p = find(papers.shop, type);
    const r = newest.get(type);
    return { key: type, title: t(`shop.paper_${type}` as TKey), hint, state: p?.state ?? "MISSING", required: p?.required ?? false,
      detail: r?.document_number ? String(r.document_number) : undefined };
  };
  const sharedItem = (type: string, hint: string): Item => {
    const p = find(papers.business, type);
    return { key: type, title: t(`shop.paper_${type}` as TKey), hint, state: p?.state ?? "MISSING", required: p?.required ?? false, shared: true };
  };
  const items: Item[] = [
    { key: "LICENCE", title: t("shop.group_licence"), hint: t("shop.group_licenceHint"), state: licenceState, required: true,
      detail: covering.map((l) => String(l.licence_number)).join(", ") || undefined },
    shopItem("SHOP_ACT", t("shop.group_shopActHint")),
    sharedItem("BUSINESS_REG", t("shop.sharedByAll")),
    sharedItem("PAN", t("shop.sharedByAll")),
    sharedItem("GSTIN", t("shop.group_gstHint")),
    shopItem("PREMISES", t("shop.group_premisesHint")),
    shopItem("LANDLORD_NOC", t("shop.hint_LANDLORD_NOC")),
  ];
  const needed = items.filter((i) => i.required);
  const done = needed.filter((i) => IN.includes(i.state)).length;
  const current = items.find((i) => i.key === open);

  const chip = (i: Item) =>
    IN.includes(i.state) || i.state === "REJECTED" || i.state === "EXPIRED"
      ? <Chip tone={STATUS_TONE[i.state] ?? "muted"}>{tMaybe(`shop.status_${i.state}`) ?? t("shop.status_OTHER")}</Chip>
      : i.state === "NOT_LINKED" ? <Chip tone="attention">{t("shop.notLinked")}</Chip>
      : i.required ? <Chip tone="attention">{t("shop.neededToList")}</Chip>
      : <Chip tone="muted">{t("common.optional")}</Chip>;

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      {params.get("new") && (
        <p className="flex gap-2 rounded-2xl bg-info-soft p-3 text-sm text-info">
          <Info className="h-5 w-5 shrink-0" aria-hidden />
          <span>{t("shop.newShopNote")}</span>
        </p>
      )}

      <Card>
        <div className="mb-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-base font-semibold text-ink">{t("shop.papersProgress", { n: done, total: needed.length })}</p>
            <p className="text-sm text-ink-3">{t("shop.papersPageHint")}</p>
          </div>
          <div className="h-2 rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={needed.length} aria-valuenow={done}>
            <div className={`h-2 rounded-full ${TONE.good.dot}`} style={{ width: `${(done / needed.length) * 100}%` }} />
          </div>
        </div>

        <ul className="-mx-2 flex flex-col divide-y divide-line">
          {items.map((i, n) => {
            const ok = IN.includes(i.state);
            const action: ReactNode = i.shared
              ? <Link href="/merchant/papers" className="inline-flex min-h-11 items-center gap-1 rounded-2xl px-3 text-sm font-semibold text-ink hover:bg-surface-3">
                  {ok ? t("common.view") : t("shop.addThere")}<ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              : (write || ok) && <Button variant={ok ? "ghost" : "secondary"} onClick={() => setOpen(i.key)}>
                  {ok ? t("shop.manage") : i.key === "LICENCE" ? t("shop.linkLicence") : t("shop.upload")}
                </Button>;
            return (
              <li key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2 py-3">
                <span className={`tnum inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${ok ? "bg-verified-soft text-verified" : "bg-surface-3 text-ink-2"}`}>
                  {ok ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : n + 1}
                </span>
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-sm font-semibold text-ink">{i.title}</span>
                  <span className="block text-xs text-ink-3">{i.detail ? `${i.detail} · ` : ""}{i.hint}</span>
                </span>
                <span className="flex w-full items-center gap-2 pl-11 @2xl:w-auto @2xl:pl-0">{chip(i)}{action}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Sheet open={current != null} onClose={() => setOpen(null)} title={current?.title ?? ""}>
        {current?.key === "LICENCE" ? (
          <LicencePicker shopId={shopId} />
        ) : current && (
          <PaperSlot type={current.key} base={`/shops/${shopId}/documents`} title={current.title} hint={current.hint}
            required={current.required} row={newest.get(current.key)} note={find(papers.shop, current.key)?.note} canWrite={write} bare />
        )}
      </Sheet>
    </div>
  );
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
