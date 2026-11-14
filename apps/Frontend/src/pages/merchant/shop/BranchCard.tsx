import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Rocket, Store, Trash2 } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { can as roleCan } from "../../../lib/permissions";
import type { Tone } from "../../../lib/bookingStage";
import { useT, type TKey } from "../../../i18n";
import { Toggle } from "../../../components/Toggle";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../query";
import { Button, Card, Chip, ConfirmSheet, ErrorNote, Select } from "../ui/ui";
import type { SetupData } from "../setup/GetListedChip";

export const VERIFY_TONE: Record<string, Tone> = { UNVERIFIED: "muted", PENDING: "info", VERIFIED: "good", REJECTED: "bad" };

export function BranchCard({ shop: s, token, licences, reloadShops, selectShop, goPapers }: { shop: Row; token: string; licences: Row[]; reloadShops: () => void; selectShop: (id: string) => void; goPapers: () => void }) {
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const id = String(s.id);
  // Each card is a different shop with its own role, so gate on this shop's role, not the selected one.
  const role = String(s.role ?? "");
  const canWrite = roleCan(role, "shop:write");
  const canDelete = roleCan(role, "shop:delete");
  const setup = useMerchantQuery<SetupData>(roleCan(role, "fleet:read") ? `/shops/${id}/setup` : null, token);
  const [sheet, setSheet] = useState<"remove" | null>(null);
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = s.status === "OPEN";
  const verify = String(s.verification_status ?? "UNVERIFIED");

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      reloadShops();
      await invalidate();
      after?.();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }
  const [pick, setPick] = useState("");
  const covers = (l: Row) => ((l.shops ?? []) as { id?: string }[]).some((x) => String(x.id) === id);
  const used = licences.filter(covers);
  const unused = licences.filter((l) => !covers(l));
  const link = (l: Row) => run(() => portalFetch("merchant", covers(l) ? `/licences/${l.id}/shops/${id}` : `/licences/${l.id}/shops`, covers(l) ? { method: "DELETE", token } : { method: "POST", token, body: { shopId: id } }));

  return (
    <Card title={String(s.name)} icon={Store} action={<Chip tone={VERIFY_TONE[verify] ?? "muted"}>{t(`status.verify_${verify}` as TKey)}</Chip>}>
      <p className="mb-3 text-sm text-ink-2">{[s.address_line1, s.city].filter(Boolean).map(String).join(", ")}</p>
      {verify === "REJECTED" && setup.data?.shop.rejectionNote && <p className="mb-3 rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">{setup.data.shop.rejectionNote}</p>}

      {canWrite && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
          <span className="text-sm font-medium text-ink">{open ? t("common.shopOpen") : t("common.shopClosed")}</span>
          <Toggle checked={open} disabled={busy} label={t("common.shopOpen")} onChange={(on) => run(() => portalFetch("merchant", `/shops/${id}`, { method: "PATCH", token, body: { status: on ? "OPEN" : "CLOSED" } }))} />
        </div>
      )}

      <div className="mb-4">
        <p className="mb-2 text-sm font-semibold text-ink">{t("shop.licencesTitle")}</p>
        {licences.length === 0 ? (
          <p className="text-sm text-ink-3">{t("shop.noLicenceYet")} <button type="button" onClick={goPapers} className="font-semibold text-ink underline">{t("shop.addLicenceLink")}</button></p>
        ) : (
          <>
            {/* Only what covers this branch is listed; other licences sit in one picker,
                since an owner usually has a single licence for every branch. */}
            {used.length === 0 ? (
              <p className="mb-2 text-sm text-ink-3">{t("shop.noLicenceForBranch")}</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-2">
                {used.map((l) => (
                  <li key={String(l.id)} className="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ink">{String(l.licence_number)}</span>
                    {canWrite ? (
                      <Button variant="ghost" disabled={busy} onClick={() => link(l)}>{t("shop.detach")}</Button>
                    ) : (
                      <Chip tone="good">{t("shop.covers")}</Chip>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && unused.length > 0 && (
              <div className="flex gap-2">
                <Select
                  compact
                  className="flex-1"
                  ariaLabel={t("shop.attachPick")}
                  placeholder={t("shop.attachPick")}
                  value={pick}
                  onChange={setPick}
                  options={unused.map((l) => ({ value: String(l.id), label: String(l.licence_number) }))}
                />
                <Button disabled={busy || !pick} onClick={() => { const l = unused.find((x) => String(x.id) === pick); if (l) { setPick(""); link(l); } }}>{t("shop.attach")}</Button>
              </div>
            )}
          </>
        )}
      </div>

      {error && <div className="mb-3"><ErrorNote text={error} /></div>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button icon={ArrowRight} onClick={() => { selectShop(id); navigate("/merchant/shop"); }}>{t("shop.openShop")}</Button>
        {canWrite && verify !== "VERIFIED" && (
          <Link href="/merchant/setup" onClick={() => selectShop(id)}><Button variant="primary" icon={Rocket}>{t("shop.getListed")}</Button></Link>
        )}
        {canDelete && <Button variant="ghost" icon={Trash2} className="text-danger" onClick={() => setSheet("remove")}>{t("shop.removeBranch")}</Button>}
      </div>

      <ConfirmSheet
        open={sheet === "remove"}
        onClose={() => { setSheet(null); setError(null); }}
        title={t("shop.removeTitle", { name: String(s.name) })}
        body={t("shop.removeBody")}
        confirmLabel={t("shop.removeConfirm")}
        danger
        busy={busy}
        error={error}
        onConfirm={() => run(() => portalFetch("merchant", `/shops/${id}`, { method: "DELETE", token }), () => setSheet(null))}
      />
    </Card>
  );
}
