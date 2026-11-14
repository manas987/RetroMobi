import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "wouter";
import { Info } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { useT, type TKey } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ErrorNote, LoadingRows, Select } from "../ui/ui";
import type { SetupData } from "../setup/GetListedChip";
import { newestByType, PaperSlot, STATUS_TONE } from "./PaperSlot";

/**
 * The papers this one shop needs, in the order of the licence rules:
 * transport licence, Shop Act, business registration & PAN, GST, premises.
 * Business-wide papers are only shown here; they are uploaded once on
 * Licence & papers and shared by every shop.
 */
export function ShopPapersTab({ shopId }: { shopId: string }) {
  const { token, can } = useMerchantShop();
  const { t } = useT();
  const [params] = useSearchParams();
  const setup = useMerchantQuery<SetupData>(`/shops/${shopId}/setup`, token);
  const docs = useMerchantQuery<{ documents: Row[] }>(`/shops/${shopId}/documents`, token);
  const write = can("shop:write");

  if (setup.isPending || docs.isPending) return <LoadingRows rows={4} />;
  if (setup.isError || docs.isError) return <ErrorNote onRetry={() => { void setup.refetch(); void docs.refetch(); }} />;

  const newest = newestByType(docs.data.documents);
  const papers = setup.data.papers;
  const shopPaper = (type: string) => papers.shop.find((p) => p.type === type);
  const slot = (type: string, hint?: string) => (
    <PaperSlot type={type} base={`/shops/${shopId}/documents`} title={t(`shop.paper_${type}` as TKey)} hint={hint}
      required={shopPaper(type)?.required ?? false} row={newest.get(type)} note={shopPaper(type)?.note} canWrite={write} />
  );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {params.get("new") && (
        <p className="flex gap-2 rounded-2xl bg-info-soft p-3 text-sm text-info">
          <Info className="h-5 w-5 shrink-0" aria-hidden />
          <span>{t("shop.newShopNote")}</span>
        </p>
      )}
      <Group n={1} title={t("shop.group_licence")} hint={t("shop.group_licenceHint")}>
        <LicencePicker shopId={shopId} setup={setup.data} />
      </Group>
      <Group n={2} title={t("shop.group_shopAct")} hint={t("shop.group_shopActHint")}>
        {slot("SHOP_ACT")}
      </Group>
      <Group n={3} title={t("shop.group_business")} hint={t("shop.sharedByAll")}>
        <Shared types={["BUSINESS_REG", "PAN"]} papers={papers.business} />
      </Group>
      <Group n={4} title={t("shop.group_gst")} hint={t("shop.group_gstHint")}>
        <Shared types={["GSTIN"]} papers={papers.business} />
      </Group>
      <Group n={5} title={t("shop.group_premises")} hint={t("shop.group_premisesHint")}>
        <div className="flex flex-col gap-3">
          {slot("PREMISES")}
          {slot("LANDLORD_NOC", t("shop.hint_LANDLORD_NOC"))}
        </div>
      </Group>
    </div>
  );
}

function Group({ n, title, hint, children }: { n: number; title: string; hint: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
        <span className="tnum inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm">{n}</span>
        {title}
      </h3>
      <p className="mb-3 mt-1 text-sm text-ink-3">{hint}</p>
      {children}
    </Card>
  );
}

/** Read-only status of a business-wide paper, with a link to where it's uploaded. */
function Shared({ types, papers }: { types: string[]; papers: SetupData["papers"]["business"] }) {
  const { t, tMaybe } = useT();
  return (
    <ul className="flex flex-col gap-2">
      {types.map((type) => {
        const p = papers.find((x) => x.type === type);
        const state = p?.state ?? "MISSING";
        return (
          <li key={type} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3">
            <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{t(`shop.paper_${type}` as TKey)}</span>
            {state === "MISSING"
              ? <Chip tone={p?.required ? "attention" : "muted"}>{p?.required ? t("shop.neededToList") : t("common.optional")}</Chip>
              : <Chip tone={STATUS_TONE[state] ?? "muted"}>{tMaybe(`shop.status_${state}`) ?? t("shop.status_OTHER")}</Chip>}
            <Link href="/merchant/papers" className="text-sm font-semibold text-ink underline underline-offset-2">
              {state === "MISSING" ? t("shop.addThere") : t("common.view")}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One transport licence covers the main shop and its branches once the
 * transport office lists the branch, so the question is which licence lists
 * this shop. `/licences` is the signed-in person's own; a manager at someone
 * else's shop gets none and only sees the status.
 */
function LicencePicker({ shopId, setup }: { shopId: string; setup: SetupData }) {
  const { token, can, reloadShops } = useMerchantShop();
  const { t, lang, tMaybe } = useT();
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
  const status = setup.licence.status;

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

  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {status === "NONE"
          ? <Chip tone="attention">{t("shop.neededToList")}</Chip>
          : <Chip tone={STATUS_TONE[status] ?? "muted"}>{tMaybe(`shop.status_${status}`) ?? t("shop.status_OTHER")}</Chip>}
      </p>
      {used.length > 0 && (
        <ul className="flex flex-col gap-2">
          {used.map((l) => (
            <li key={String(l.id)} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-ink">{String(l.licence_number)}</span>
              {write && <Button variant="ghost" disabled={busy} onClick={() => link(l)}>{t("shop.detach")}</Button>}
            </li>
          ))}
        </ul>
      )}
      {write && unused.length > 0 && (
        <div className="flex gap-2">
          <Select compact className="flex-1" ariaLabel={t("shop.whichLicence")} placeholder={t("shop.whichLicence")} value={pick} onChange={setPick}
            options={unused.map((l) => ({ value: String(l.id), label: String(l.licence_number) }))} />
          <Button disabled={busy || !pick} onClick={() => { const l = unused.find((x) => String(x.id) === pick); if (l) { setPick(""); void link(l); } }}>{t("shop.attach")}</Button>
        </div>
      )}
      {write && licences.isSuccess && all.length === 0 && (
        <Link href="/merchant/papers" className="text-sm font-semibold text-ink underline underline-offset-2">{t("shop.addLicenceLink")}</Link>
      )}
      {error && <ErrorNote text={error} />}
    </div>
  );
}
