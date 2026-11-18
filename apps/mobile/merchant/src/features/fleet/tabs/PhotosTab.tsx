import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Camera, ChevronDown, ChevronUp, Image as ImageIcon, Trash2 } from "lucide-react-native";
import {
  ApiError, Button, Card, ConfirmSheet, EmptyState, ErrorNote, LoadingRows, Switch, Text, UploadFailedError, api, colors, errorText,
  queryClient, radius, space, uploadFile, useT, type Row,
} from "@retromobi/mobile-shared";
import { IconAction, counterStyles } from "../../../ui/Counter";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { useCounterWrite } from "../../bookings/common";
import { CameraDenied, isDownloadable, openFile, openSettings, pickImages } from "../files";
import { Fields, Pending } from "./Fields";

export function PhotosTab({ id, basePath, canWrite }: { id: string; basePath?: string; canWrite?: boolean }) {
  const { t, lang } = useT();
  const { can } = useMerchantShop();
  const base = basePath ?? `/vehicles/${id}/media`;
  const q = useMerchantQuery<{ media: Row[] }>(base);
  const write = useCounterWrite();
  const [remove, setRemove] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  const media = q.data.media;
  const writable = canWrite ?? can("fleet:write");

  function onError(err: unknown) {
    if (err instanceof CameraDenied) {
      setNotice(lang === "hi" ? "फ़ोटो लेने के लिए कैमरे की अनुमति दें या गैलरी से चुनें।" : "Allow camera access to take a photo, or choose one from your gallery.");
      setSettings(!err.canAskAgain);
    } else if (err instanceof UploadFailedError) setNotice(t("fleet.uploadFailed"));
    else if (err instanceof ApiError && err.code === "invalid_photo") setNotice(t("fleet.photoNotPublished"));
    else if (err instanceof ApiError && err.code === "storage_unconfigured") setNotice(t("fleet.storageUnconfigured"));
    else setNotice(errorText(lang, err));
    return true;
  }

  function run(fn: () => Promise<void>) {
    setNotice(null);
    setSettings(false);
    void write.run(fn, { onError });
  }

  function upload(camera: boolean) {
    run(async () => {
      const files = await pickImages(camera);
      let refused: unknown = null;
      try {
        for (const file of files) {
          const row = await uploadFile<Row>({ file, presignPath: `${base}/upload`, confirmPath: `${base}/confirm`, confirmBody: basePath ? { type: "IMAGE" } : undefined });
          try { await api(`${base}/${row.id}`, { method: "PATCH", body: { published: true } }); }
          catch (err) { refused = err; }
        }
        if (refused) throw refused;
      } finally {
        if (files.length) void queryClient.invalidateQueries({ queryKey: ["merchant"] });
      }
    });
  }

  function move(i: number, delta: number) {
    const next = [...media];
    [next[i], next[i + delta]] = [next[i + delta]!, next[i]!];
    run(async () => { await api(`${base}/order`, { method: "PATCH", body: { order: next.map((row, index) => ({ id: String(row.id), displayOrder: index })) } }); });
  }

  return <Fields>
      <Text size="lg" weight="bold" accessibilityRole="header">{t("fleet.photosTitle")}</Text>
      <Text color="ink2">{t("fleet.photosHint")}</Text>
      {notice && <ErrorNote text={notice} />}
      {settings && <Button label={lang === "hi" ? "सेटिंग खोलें" : "Open settings"} onPress={() => void openSettings().catch(() => {})} />}
      {!media.length && <EmptyState text={t("fleet.photosEmpty")} />}
      {writable && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        <Button variant="primary" icon={Camera} label={t("fleet.takePhoto")} disabled={write.busy} onPress={() => upload(true)} />
        <Button icon={ImageIcon} label={t("fleet.fromGallery")} disabled={write.busy} onPress={() => upload(false)} />
      </View>}
      {write.busy && <Text color="ink2" accessibilityLiveRegion="polite">{t("common.saving")}</Text>}
      {media.map((row, i) => {
        const label = t(row.type === "VIDEO" ? "fleet.video" : "fleet.photoN", { n: i + 1 });
        return <Card key={String(row.id)} style={counterStyles.panel} title={label}>
          <Fields>
            <MediaThumb path={`${base}/${row.id}/download`} canPreview={row.type !== "VIDEO"} id={String(row.id)} />
            {writable && row.type !== "VIDEO" ? <View style={{ flexDirection: "row", alignItems: "center", minHeight: 48, gap: space[2] }}>
              <Text style={{ flex: 1 }}>{t("fleet.showToCustomers")}</Text>
              <Switch value={!!row.published} disabled={write.busy} accessibilityLabel={`${label} · ${t("fleet.showToCustomers")}`}
                onValueChange={(published) => run(async () => { await api(`${base}/${row.id}`, { method: "PATCH", body: { published } }); })} />
            </View> : <Text color="ink2">{t(row.published ? "fleet.shown" : "fleet.hidden")}</Text>}
            {writable && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1] }}>
              <IconAction icon={ChevronUp} label={t("fleet.moveEarlier")} disabled={write.busy || i === 0} onPress={() => move(i, -1)} />
              <IconAction icon={ChevronDown} label={t("fleet.moveLater")} disabled={write.busy || i === media.length - 1} onPress={() => move(i, 1)} />
              <IconAction icon={Trash2} label={t("common.remove")} disabled={write.busy} onPress={() => { setNotice(null); setRemove(row); }} />
            </View>}
          </Fields>
        </Card>;
      })}
      <ConfirmSheet open={!!remove} title={t("common.remove")} body={remove?.type === "VIDEO" ? t("fleet.video") : t("fleet.photosTitle")}
        cancelLabel={t("common.cancel")} confirmLabel={t("common.remove")} danger busy={write.busy} error={notice}
        onClose={() => setRemove(null)} onConfirm={() => {
          if (remove) run(async () => { await api(`${base}/${remove.id}`, { method: "DELETE" }); setRemove(null); });
        }} />
  </Fields>;
}

function MediaThumb({ path, canPreview, id }: { path: string; canPreview: boolean; id: string }) {
  const { t } = useT();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const result = useMerchantQuery<{ downloadUrl: string }>(path);
  const url = result.data?.downloadUrl;
  return <>
    {result.isPending ? <LoadingRows rows={1} height={88} label={t("common.loading")} />
      : canPreview && isDownloadable(url) && url !== failedUrl ? <Image source={{ uri: url, cacheKey: id }} recyclingKey={id} cachePolicy="memory-disk" transition={150} contentFit="cover" accessible={false}
        onError={() => setFailedUrl(url)} style={{ height: 170, borderRadius: radius.panel, backgroundColor: colors.surface3 }} />
      : <View style={{ ...counterStyles.row, borderRadius: radius.panel, backgroundColor: colors.surface2, padding: space[3] }}>
        <ImageIcon color={colors.ink2} size={22} accessible={false} />
        <Text size="sm" color="ink2" style={{ flex: 1 }}>{t(canPreview ? "fleet.previewUnavailable" : "fleet.video")}</Text>
      </View>}
    {isDownloadable(url) && <Button label={t("common.view")} variant="ghost" onPress={() => { void openFile(url).catch(() => setError(true)); }} />}
    {error && <ErrorNote text={t("common.couldntLoad")} />}
  </>;
}
