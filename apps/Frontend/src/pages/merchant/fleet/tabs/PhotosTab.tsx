import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Film, ImageIcon, Images, Trash2 } from "lucide-react";
import { portalFetch, PortalApiError, type Row } from "../../../../lib/portal";
import { uploadFile, UploadFailedError } from "../../../../lib/upload";
import { useT } from "../../../../i18n";
import { Toggle } from "../../../../components/Toggle";
import { useMerchantShop } from "../../Layout";
import { errorText, useInvalidateMerchant, useMerchantQuery } from "../../query";
import { Button, Card, EmptyState, ErrorNote, LoadingRows } from "../../ui/ui";

/** Vehicle photos by default; the shop page passes its own `base` (shop media has no IMAGE/VIDEO type). */
export function PhotosTab({ id, base = `/vehicles/${id}/media`, canWrite, mediaType = true }: { id: string; base?: string; canWrite?: boolean; mediaType?: boolean }) {
  const { token, can } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const q = useMerchantQuery<{ media: Row[] }>(base, token);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const write = canWrite ?? can("fleet:write");
  const media = q.data?.media ?? [];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof UploadFailedError ? t("fleet.uploadFailed")
        : err instanceof PortalApiError && err.code === "invalid_photo" ? t("fleet.photoNotPublished")
        : err instanceof PortalApiError && err.code === "storage_unconfigured" ? t("fleet.storageUnconfigured") : errorText(lang, err));
    } finally {
      // A photo can be saved even when publishing it was refused, so refresh either way.
      await invalidate();
      setBusy(false);
    }
  }

  const upload = (files: FileList | null) =>
    files &&
    run(async () => {
      let refused: unknown = null;
      for (const file of Array.from(files)) {
        const m = await uploadFile<Row>({
          portal: "merchant", token, file,
          presignPath: `${base}/upload`,
          confirmPath: `${base}/confirm`,
          confirmBody: mediaType ? { type: "IMAGE" } : undefined,
        });
        // Customers only see published photos, and a new one should show at once.
        // A refused publish leaves the photo saved but hidden; carry on with the rest.
        await portalFetch("merchant", `${base}/${m.id}`, { method: "PATCH", token, body: { published: true } }).catch((e) => { refused = e; });
      }
      if (refused) throw refused;
    });

  const patch = (mid: unknown, body: unknown) => run(() => portalFetch("merchant", `${base}/${mid}`, { method: "PATCH", token, body }));
  const remove = (mid: unknown) => run(() => portalFetch("merchant", `${base}/${mid}`, { method: "DELETE", token }));
  /** The endpoint replaces the whole order, so the full list goes even for one move. */
  const move = (i: number, delta: number) => {
    const next = [...media];
    [next[i], next[i + delta]] = [next[i + delta]!, next[i]!];
    return run(() => portalFetch("merchant", `${base}/order`, {
      method: "PATCH", token, body: { order: next.map((m, k) => ({ id: String(m.id), displayOrder: k })) },
    }));
  };

  const picker = write && (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <input ref={gallery} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={Camera} disabled={busy} onClick={() => camera.current?.click()}>{busy ? t("common.saving") : t("fleet.takePhoto")}</Button>
        <Button icon={Images} disabled={busy} onClick={() => gallery.current?.click()}>{t("fleet.fromGallery")}</Button>
      </div>
    </>
  );

  return (
    <Card title={t("fleet.photosTitle")} action={media.length > 0 ? picker || undefined : undefined}>
      <p className="mb-4 text-sm text-ink-3">{t("fleet.photosHint")}</p>
      {error && <div className="mb-4"><ErrorNote text={error} /></div>}
      {q.isPending && <LoadingRows rows={2} />}
      {q.isError && <ErrorNote onRetry={() => q.refetch()} />}
      {q.data && media.length === 0 && <EmptyState icon={Camera} text={t("fleet.photosEmpty")} action={picker || undefined} />}
      <ul className="grid gap-3 sm:grid-cols-2">
        {media.map((m, i) => (
          <li key={String(m.id)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <Thumb base={base} mid={String(m.id)} video={m.type === "VIDEO"} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{m.type === "VIDEO" ? t("fleet.video") : t("fleet.photoN", { n: i + 1 })}</p>
              {write && m.type === "IMAGE" ? (
                <span className="mt-1 flex items-center gap-2 text-xs text-ink-2">
                  <Toggle checked={Boolean(m.published)} disabled={busy} onChange={(published) => patch(m.id, { published })} label={t("fleet.showToCustomers")} />
                  {t("fleet.showToCustomers")}
                </span>
              ) : (
                <p className="text-xs text-ink-3">{m.published ? t("fleet.shown") : t("fleet.hidden")}</p>
              )}
            </div>
            {write && (
              <div className="flex shrink-0 items-center">
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={t("fleet.moveEarlier")} className="inline-flex h-11 w-9 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-30"><ArrowUp className="h-4 w-4" aria-hidden /></button>
                <button type="button" disabled={busy || i === media.length - 1} onClick={() => move(i, 1)} aria-label={t("fleet.moveLater")} className="inline-flex h-11 w-9 items-center justify-center text-ink-2 hover:text-ink disabled:opacity-30"><ArrowDown className="h-4 w-4" aria-hidden /></button>
                <button type="button" disabled={busy} onClick={() => remove(m.id)} aria-label={t("common.remove")} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-danger hover:bg-danger-soft disabled:opacity-30"><Trash2 className="h-5 w-5" aria-hidden /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Each thumbnail resolves its own short-lived download URL; a failure falls back to an icon. */
function Thumb({ base, mid, video }: { base: string; mid: string; video: boolean }) {
  const { token } = useMerchantShop();
  const [url, setUrl] = useState<string | null>(null);
  const Icon = video ? Film : ImageIcon;

  useEffect(() => {
    let cancelled = false;
    portalFetch<{ downloadUrl: string }>("merchant", `${base}/${mid}/download`, { token })
      .then((r) => !cancelled && setUrl(r.downloadUrl))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [base, mid, token]);

  return url && !video ? (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0"><img src={url} alt="" onError={() => setUrl(null)} className="h-16 w-16 rounded-xl bg-surface-3 object-cover" /></a>
  ) : (
    <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink-3"><Icon className="h-5 w-5" aria-hidden /></span>
  );
}
