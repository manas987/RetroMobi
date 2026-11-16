import { useState } from "react";
import { Linking, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ApiError, Button, Card, Chip, ConfirmSheet, DateField, EmptyState, ErrorNote, SelectField, Text, UploadFailedError,
  api, dateLabel, errorText, istDay, queryClient, space, uploadFile, useT, type PickedFile, type Row, type Tone,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite } from "../bookings/common";
import { CameraDenied, openFile, pickImages, pickPaper } from "../fleet/files";
import { Fields, FormButtons, LabelInput, Pending } from "../fleet/tabs/Fields";
import { useSetup, type SetupPaper } from "../fleet/listing";

const tones: Record<string, Tone> = { ACTIVE: "good", VERIFIED: "good", PENDING: "info", REJECTED: "bad", EXPIRED: "bad" };
const useDocs = (path: string | null) => useMerchantQuery<{ documents: Row[] }>(path);

function FileButtons({ select, busy }: { select: (file: PickedFile) => Promise<void>; busy: boolean }) {
  const { t, lang } = useT();
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [picking, setPicking] = useState(false);
  const choose = async (camera: boolean) => {
    if (busy || picking) return;
    setPicking(true); setError(null); setSettings(false);
    try {
      const file = camera ? (await pickImages(true))[0] : await pickPaper();
      if (file) await select(file);
    } catch (err) {
      if (err instanceof CameraDenied) {
        setError(lang === "hi" ? "कैमरे की अनुमति दें या फ़ाइल चुनें।" : "Allow camera access or choose a file instead.");
        setSettings(!err.canAskAgain);
      } else setError(errorText(lang, err));
    } finally { setPicking(false); }
  };
  return <Fields>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      <Button label={t("fleet.takePhoto")} disabled={busy || picking} onPress={() => void choose(true)} />
      <Button label={t("common.uploadFile")} disabled={busy || picking} onPress={() => void choose(false)} />
    </View>
    {error && <ErrorNote text={error} />}
    {settings && <Button label={lang === "hi" ? "सेटिंग खोलें" : "Open settings"} onPress={() => void Linking.openSettings().catch(() => {})} />}
  </Fields>;
}

function PaperCard({ entry, row, base, editable }: { entry: SetupPaper; row?: Row; base: string; editable: boolean }) {
  const { t, lang, tMaybe } = useT();
  const [edit, setEdit] = useState(false);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [remove, setRemove] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const write = useCounterWrite();
  const title = tMaybe(`shop.paper_${entry.type}`) ?? entry.type;
  const state = entry.state === "MISSING" ? entry.state : row?.expires_at && String(row.expires_at).slice(0, 10) < istDay(new Date()) ? "EXPIRED" : entry.state;
  const path = row ? `${base}/${row.id}` : null;
  function run(action: () => Promise<void>) {
    setNotice(null);
    void write.run(action, { onError: (err) => {
      setNotice(err instanceof UploadFailedError ? t("fleet.uploadFailed") : err instanceof ApiError && err.code === "storage_unconfigured"
        ? t("shop.fileMissing") : errorText(lang, err)); return true;
    } });
  }
  return <Card title={title}>
    <Fields>
      <Chip tone={tones[state] ?? "muted"} label={tMaybe(`shop.status_${state}`) ?? t("shop.notAdded")} />
      <Text size="sm" color="ink2">{t(entry.required ? "shop.neededToList" : "common.optional")}</Text>
      {row?.document_number != null && <Text>{String(row.document_number)}</Text>}
      {row?.expires_at != null && <Text size="sm" color="ink2">{t("shop.validTill", { date: dateLabel(row.expires_at, lang) })}</Text>}
      {entry.note && <Text color="danger">{entry.note}</Text>}
      {notice && <ErrorNote text={notice} />}
      {path && row?.storage_key != null && <Button label={t("common.view")} disabled={write.busy} onPress={() => run(async () => {
        await openFile((await api<{ downloadUrl: string }>(`${path}/download`)).downloadUrl);
      })} />}
      {editable && (!edit ? <Button label={t(path ? "fleet.replaceFile" : "shop.upload")} disabled={write.busy} onPress={() => setEdit(true)} /> : <>
        {!path && !created && <>
          <LabelInput label={t("shop.paperNumber")} value={number} onChangeText={setNumber} />
          <DateField label={t("fleet.fExpires")} value={expiry} onChange={setExpiry} clearable />
        </>}
        {file?.name && <Text size="sm">{file.name}</Text>}
        <FileButtons busy={write.busy} select={async (picked) => { setFile(picked); }} />
        <FormButtons busy={write.busy} valid={!!file} error={null} close={() => { setEdit(false); setFile(null); }} save={() => {
          if (!file) return;
          run(async () => {
            let uploadPath = path ?? (created ? `${base}/${created}` : null);
            if (!uploadPath) {
              const paper = await api<Row>(base, { method: "POST", body: { type: entry.type, documentNumber: number.trim() || undefined, expiresAt: expiry || undefined } });
              setCreated(String(paper.id));
              uploadPath = `${base}/${paper.id}`;
            }
            try { await uploadFile({ file, presignPath: `${uploadPath}/upload`, confirmPath: `${uploadPath}/confirm` }); }
            finally { void queryClient.invalidateQueries({ queryKey: ["merchant"] }); }
            setEdit(false); setFile(null); setCreated(null);
          });
        }} />
      </>)}
      {editable && path && <Button label={t("common.remove")} variant="ghost" disabled={write.busy} onPress={() => { setNotice(null); setRemove(true); }} />}
      <ConfirmSheet open={remove} onClose={() => setRemove(false)} title={t("shop.removePaperTitle", { name: title })} body={t("shop.removePaperBody")}
        confirmLabel={t("common.remove")} cancelLabel={t("common.cancel")} danger busy={write.busy} error={notice}
        onConfirm={() => { if (path) run(async () => { await api(path, { method: "DELETE" }); setRemove(false); }); }} />
    </Fields>
  </Card>;
}

const covers = (row: Row, shopId: string) => Array.isArray(row.shops) && row.shops.some((shop) => shop.shop_id === shopId || shop.id === shopId);

function Licences({ shopId, all, editable }: { shopId: string; all: boolean; editable: boolean }) {
  const { t, lang, tMaybe } = useT();
  const q = useMerchantQuery<{ licences: Row[] }>("/licences");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const write = useCounterWrite();
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  const licences = q.data.licences;
  const linked = licences.filter((row) => covers(row, shopId));
  const unlinked = licences.filter((row) => !covers(row, shopId));
  const list = all ? licences : linked;
  const link = (id: string, detach: boolean) => void write.run(async () => {
    await api(detach ? `/licences/${id}/shops/${shopId}` : `/licences/${id}/shops`, detach ? { method: "DELETE" } : { method: "POST", body: { shopId } });
    setSelected("");
  });

  return <Card title={t("shop.group_licence")}>
    <Fields>
      <Text color="ink2">{t(all ? "shop.licenceCardHint" : "shop.group_licenceHint")}</Text>
      {list.length === 0 && <EmptyState text={t(all ? "shop.noLicences" : "shop.noLicenceForBranch")} />}
      {list.map((row) => {
        const linkedHere = covers(row, shopId);
        const status = row.expires_at && String(row.expires_at).slice(0, 10) < istDay(new Date()) ? "EXPIRED" : String(row.status);
        return <Card key={String(row.id)} title={String(row.licence_number ?? "")}>
          <Fields>
            <Chip tone={tones[status] ?? "muted"} label={tMaybe(`shop.status_${status}`) ?? t("shop.status_OTHER")} />
            <Text size="sm" color="ink2">{t("shop.validTill", { date: dateLabel(row.expires_at, lang) })}</Text>
            {!!row.storage_key && <Button label={t("common.view")} disabled={write.busy} onPress={() => void write.run(async () => {
              await openFile((await api<{ downloadUrl: string }>(`/licences/${row.id}/download`)).downloadUrl);
            })} />}
            {editable && linkedHere && <Button label={t("shop.detach")} variant="ghost" disabled={write.busy} onPress={() => link(String(row.id), true)} />}
            {linkedHere && !editable && <Chip tone="good" label={t("shop.covers")} />}
            {editable && all && !linkedHere && <Button label={t("shop.linkLicence")} disabled={write.busy} onPress={() => link(String(row.id), false)} />}
          </Fields>
        </Card>;
      })}
      {editable && !all && unlinked.length > 0 && <>
        <SelectField label={t("shop.attachPick")} value={selected || null} onChange={setSelected} closeLabel={t("common.close")}
          options={unlinked.map((row) => ({ value: String(row.id), label: String(row.licence_number) }))} />
        {selected && <Button label={t("shop.attach")} busy={write.busy} onPress={() => link(selected, false)} />}
      </>}
      {write.error && <ErrorNote text={write.error} />}
      {editable && (adding ? <LicenceForm shopId={shopId} close={() => setAdding(false)} /> : <Button label={t("shop.addLicence")} onPress={() => setAdding(true)} />)}
    </Fields>
  </Card>;
}

function LicenceForm({ shopId, close }: { shopId: string; close: () => void }) {
  const { t } = useT();
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const write = useCounterWrite();
  const valid = !!number.trim() && !!expiry && !!file;
  return <Fields>
    <LabelInput label={t("setup.licenceNumber")} value={number} onChangeText={setNumber} editable={created === null} />
    {created ? <Text>{expiry}</Text> : <DateField label={t("setup.licenceExpiry")} value={expiry} onChange={setExpiry} min={istDay(new Date())} />}
    {file?.name && <Text>{file.name}</Text>}
    {!uploaded && <FileButtons busy={write.busy} select={async (picked) => { setFile(picked); }} />}
    <FormButtons valid={valid} busy={write.busy} error={write.error} close={close} save={() => {
      if (!valid || !file) return;
      void write.run(async () => {
        const id = created ?? String((await api<Row>("/licences", { method: "POST", body: { licenceNumber: number.trim(), expiresAt: expiry } })).id);
        setCreated(id);
        try {
          if (!uploaded) {
            await uploadFile({ file, presignPath: `/licences/${id}/upload`, confirmPath: `/licences/${id}/confirm` });
            setUploaded(true);
          }
          await api(`/licences/${id}/shops`, { method: "POST", body: { shopId } });
          close();
        } finally { void queryClient.invalidateQueries({ queryKey: ["merchant"] }); }
      });
    }} />
  </Fields>;
}

export function ShopPapers({ shopId, mode = "shop" }: { shopId: string; mode?: "shop" | "all" | "setup" }) {
  const { t, tMaybe } = useT();
  const { can } = useMerchantShop();
  const router = useRouter();
  const setup = useSetup(shopId);
  const editable = can("shop:write");
  const base = `/shops/${shopId}/documents`;
  const own = useDocs(editable && mode !== "all" ? base : null);
  const business = useDocs(editable ? "/merchant-documents" : null);
  if (!setup.isSuccess) return <Pending error={setup.error} retry={setup.refetch} />;
  const data = setup.data;
  const section = (kind: "shop" | "business") => {
    const q = kind === "shop" ? own : business;
    const source = kind === "shop" ? base : "/merchant-documents";
    return <Card title={t(kind === "shop" ? "shop.thisShopPapers" : "shop.businessPapers")}>
      <Fields>
        <Text color="ink2">{t(kind === "shop" ? "shop.thisShopPapersHint" : "shop.businessPapersHint")}</Text>
        {editable && !q.isSuccess ? <Pending error={q.error} retry={q.refetch} /> : data.papers[kind].filter((entry) => mode !== "setup" || entry.required).map((entry) => <PaperCard
          key={entry.type} base={source} entry={entry} editable={editable} row={q.data?.documents.find((row) => row.type === entry.type)} />)}
      </Fields>
    </Card>;
  };
  return <Fields>
    {editable ? <Licences all={mode === "all"} shopId={shopId} editable /> : <Card title={t("shop.group_licence")}>
      <Chip tone={tones[data.licence.status] ?? "muted"} label={t(`setup.st_licence_${data.licence.status}`)} />
    </Card>}
    {mode !== "all" && section("shop")}
    {section("business")}
    {mode === "all" && <Card title={t("shop.eachShopCard")}>
      <Fields><Text color="ink2">{t("shop.eachShopHint")}</Text><Button label={t("shop.openPapers")} onPress={() => router.push({ pathname: "/shop", params: { tab: "papers" } })} /></Fields>
    </Card>}
    {mode === "shop" && <Card title={t("shop.vehiclePapers")}>
      <Fields>
        <Text color="ink2">{t("shop.vehiclePapersHint")}</Text>
        {!data.vehicles.length && <EmptyState text={t("shop.noVehicles")} />}
        {data.vehicles.map((item) => <Fields key={item.id}>
          <Button label={`${item.make} ${item.model} · ${item.registrationNumber}`} onPress={() => router.push({ pathname: "/vehicle/[id]", params: { id: item.id, tab: "documents" } })} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1] }}>
            {item.requiredDocs.map((doc) => <Chip key={doc} tone={tones[item.docs[doc]?.state ?? ""] ?? "muted"}
              label={`${tMaybe(`shop.vdoc_${doc}`) ?? doc} · ${tMaybe(`shop.mark_${item.docs[doc]?.state}`) ?? t("shop.notAdded")}`} />)}
          </View>
        </Fields>)}
      </Fields>
    </Card>}
  </Fields>;
}
