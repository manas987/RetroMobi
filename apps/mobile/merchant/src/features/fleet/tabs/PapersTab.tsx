import { useState } from "react";
import { Linking, View } from "react-native";
import {
  Button, Card, Chip, ConfirmSheet, DateField, ErrorNote, Text, UploadFailedError, api, dateLabel,
  errorText, istDay, queryClient, space, uploadFile, useT, type PickedFile, type Row, type TKey, type Tone,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { useCounterWrite } from "../../bookings/common";
import { CameraDenied, openFile, pickImages, pickPaper } from "../files";
import type { SetupVehicle } from "../listing";
import { Fields, FormButtons, LabelInput, Pending } from "./Fields";

const GROUPS = [["RC", ["RC"]], ["INSURANCE", ["INSURANCE"]], ["PERMIT", ["PERMIT"]], ["PUC", ["PUC"]], ["FITNESS_TAX", ["FITNESS", "TAX"]]] as const;
const STATUS: Record<string, [Tone, TKey]> = {
  PENDING: ["info", "fleet.docPending"], VERIFIED: ["good", "fleet.docVerified"], REJECTED: ["bad", "fleet.docRejected"], EXPIRED: ["bad", "fleet.docExpiredChip"],
};

export function PapersTab({ id, setup, electric }: { id: string; setup?: SetupVehicle; electric: boolean }) {
  const { t, tMaybe, lang } = useT();
  const { can } = useMerchantShop();
  const base = `/vehicles/${id}/documents`;
  const q = useMerchantQuery<{ documents: Row[] }>(base);
  const write = useCounterWrite();
  const [form, setForm] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [replace, setReplace] = useState<Row | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const required = setup?.requiredDocs ?? (electric ? ["RC", "INSURANCE", "FITNESS", "TAX"] : ["RC", "INSURANCE", "PERMIT", "PUC", "FITNESS", "TAX"]);
  const title = (type: unknown) => tMaybe(`fleet.doc_${String(type)}`) ?? String(type);
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  const docs = q.data.documents;
  const canEdit = can("fleet:write");

  function run(fn: () => Promise<void>) {
    setNotice(null);
    setSettings(false);
    void write.run(fn, { onError: (err) => {
      if (err instanceof CameraDenied) {
        setNotice(lang === "hi" ? "कैमरे की अनुमति दें या फ़ाइल चुनें।" : "Allow camera access or choose a file instead.");
        setSettings(!err.canAskAgain);
      } else setNotice(err instanceof UploadFailedError ? t("fleet.uploadFailed") : errorText(lang, err));
      return true;
    } });
  }

  const upload = (docId: string, selected: PickedFile) => uploadFile({
    file: selected, presignPath: `${base}/${docId}/upload`, confirmPath: `${base}/${docId}/confirm`,
  });
  const start = (type: string) => {
    setForm(type); setNumber(""); setExpiry(""); setFile(null); setCreated(null); setReplace(null); setNotice(null);
  };
  const fileButtons = (picked: (value: PickedFile) => Promise<void>) => <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
    <Button label={t("fleet.takePhoto")} disabled={write.busy} onPress={() => run(async () => { const [photo] = await pickImages(true); if (photo) await picked(photo); })} />
    <Button label={t("common.uploadFile")} disabled={write.busy} onPress={() => run(async () => { const choice = await pickPaper(); if (choice) await picked(choice); })} />
  </View>;

  const render = (row: Row) => {
    const type = String(row.type);
    const expired = row.expires_at != null && String(row.expires_at).slice(0, 10) < istDay(new Date());
    const status = STATUS[expired ? "EXPIRED" : String(row.status)] ?? STATUS.PENDING!;
    const note = setup?.docs[type]?.state === "REJECTED" ? setup.docs[type]?.note : null;
    return <Card key={String(row.id)} title={title(type)}>
      <Fields>
        <Chip tone={row.storage_key ? status[0] : "muted"} label={t(row.storage_key ? status[1] : "fleet.noFile")} />
        {required.includes(type) && <Chip tone="muted" label={t("fleet.neededChip")} />}
        {row.document_number != null && <Text>{String(row.document_number)}</Text>}
        <Text size="sm" color="ink2">{row.expires_at ? t(expired ? "fleet.expiredOn" : "fleet.validTo", { date: dateLabel(row.expires_at, lang) }) : t("fleet.noExpiry")}</Text>
        {note && <Text color="danger">{note}</Text>}
        {row.storage_key != null && <Button label={t("common.view")} disabled={write.busy} onPress={() => run(async () => {
          const result = await api<{ downloadUrl: string }>(`${base}/${row.id}/download`);
          await openFile(result.downloadUrl);
        })} />}
        {canEdit && <>
          {replace?.id === row.id ? fileButtons(async (choice) => { await upload(String(row.id), choice); setReplace(null); })
            : <Button label={t(row.storage_key ? "fleet.replaceFile" : "common.uploadFile")} disabled={write.busy} onPress={() => { setReplace(row); setForm(null); setNotice(null); }} />}
          <Button label={t("common.remove")} variant="ghost" disabled={write.busy} onPress={() => { setNotice(null); setRemove(row); }} />
        </>}
      </Fields>
    </Card>;
  };
  const other = docs.filter((row) => !required.includes(String(row.type)));
  return <Card title={t("fleet.papersTitle")}>
    <Fields>
      <Text color="ink2">{t("fleet.papersHint")}</Text>
      {notice && <ErrorNote text={notice} />}
      {settings && <Button label={lang === "hi" ? "सेटिंग खोलें" : "Open settings"} onPress={() => void Linking.openSettings().catch(() => {})} />}
      {form && <Card title={title(form)}>
        <Fields>
          {!created && <>
            <LabelInput label={t("fleet.fPaperNumber")} value={number} onChangeText={setNumber} />
            <DateField label={t("fleet.fExpires")} value={expiry} onChange={setExpiry} clearable={form === "RC"} />
          </>}
          <Text>{t("fleet.fPaperFile")}{file?.name ? `: ${file.name}` : ""}</Text>
          {fileButtons(async (choice) => { setFile(choice); })}
          <FormButtons valid={!!form && (!created || !!file)} busy={write.busy} error={null} close={() => setForm(null)} save={() => run(async () => {
            let docId = created;
            if (!docId) {
              const result = await api<Row>(base, { method: "POST", body: { type: form, documentNumber: number.trim() || undefined, expiresAt: expiry || undefined } });
              docId = String(result.id);
              setCreated(docId);
            }
            if (file) {
              try { await upload(docId, file); }
              finally { void queryClient.invalidateQueries({ queryKey: ["merchant"] }); }
            }
            setForm(null);
          })} />
        </Fields>
      </Card>}
      {GROUPS.filter(([, types]) => types.some((type) => required.includes(type))).map(([key, types]) => <Fields key={key}>
        <Text weight="bold" accessibilityRole="header">{t(`fleet.paperGroup_${key}`)}</Text>
        {types.filter((type) => required.includes(type)).map((type) => {
          const list = docs.filter((row) => row.type === type);
          return list.length ? <Fields key={type}>{list.map(render)}</Fields> : <Card key={type} title={title(type)}>
            <Fields><Chip tone="muted" label={t("fleet.neededChip")} />
              {canEdit && <Button label={t("fleet.addThisPaper")} disabled={write.busy} onPress={() => start(type)} />}
            </Fields>
          </Card>;
        })}
      </Fields>)}
      {other.length > 0 && <Fields><Text weight="bold">{t("fleet.otherPapers")}</Text>{other.map(render)}</Fields>}
      <ConfirmSheet open={!!remove} title={t("common.remove")} body={title(remove?.type ?? "")} danger cancelLabel={t("common.cancel")}
        confirmLabel={t("common.remove")} busy={write.busy} error={notice} onClose={() => setRemove(null)}
        onConfirm={() => { if (remove) run(async () => { await api(`${base}/${remove.id}`, { method: "DELETE" }); setRemove(null); }); }} />
    </Fields>
  </Card>;
}
