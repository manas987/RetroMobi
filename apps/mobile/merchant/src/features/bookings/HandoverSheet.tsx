import { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { CheckCircle2, ShieldAlert, ShieldCheck, Video } from "lucide-react-native";
import {
  ApiError, Button, Card, ErrorNote, Input, LoadingRows, Segmented, Sheet, Text,
  api, colors, dateLabel, errorText, radius, space, useT, type Row,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { BookingSummary, useCounterWrite } from "./common";

type Identity = { riderName: string | null; riderDob: string | null; licenceNumberMasked: string | null; licenceExpiresOn: string | null; photoUrl: string | null; alreadyChecked: boolean };

export function HandoverSheet({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  if (!booking) return null;
  return booking.source === "OFFLINE" ? <Walkin key={String(booking.id)} booking={booking} onClose={onClose} />
    : <Online key={String(booking.id)} booking={booking} onClose={onClose} />;
}

type Props = { booking: Row; onClose: () => void };

function Walkin({ booking, onClose }: Props) {
  const { t } = useT();
  const { busy, error, run } = useCounterWrite();
  return <Sheet open title={t("actions.handoverWalkin")} onClose={onClose} closeLabel={t("common.close")} busy={busy}
    footer={<Button variant="primary" icon={CheckCircle2} label={t("actions.walkinHandoverConfirm")} busy={busy}
      onPress={() => void run(async () => { await api(`/bookings/${booking.id}/pickup`, { method: "POST" }); onClose(); }, { haptics: true })} />}>
    <View style={{ gap: space[3] }}>
      <BookingSummary booking={booking} />
      <Text color="ink2">{t("actions.walkinHandoverBody")}</Text>
      <Card title={t("actions.licenceNumber")}><Text weight="bold">{String(booking.walkin_dl_number ?? "—")}</Text></Card>
      {error && <ErrorNote text={error} />}
    </View>
  </Sheet>;
}

function Online({ booking, onClose }: Props) {
  const { t, lang } = useT();
  const query = useMerchantQuery<Identity>(`/bookings/${booking.id}/identity`, { gcTime: 0 });
  const [photo, setPhoto] = useState<"yes" | "no" | null>(null);
  const [card, setCard] = useState<"yes" | "no" | null>(null);
  const [last4, setLast4] = useState("");
  const [outcome, setOutcome] = useState<"ok" | "failed" | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const { busy, error, run } = useCounterWrite();
  const id = query.data;
  const result = outcome ?? (id?.alreadyChecked ? "waiting" : null);
  const valid = !!photo && !!card && last4.length === 4;
  const options = [{ value: "yes", label: t("actions.yes") }, { value: "no", label: t("actions.no") }] as const;
  const resultBody = result === "ok" ? t("actions.idDone") : result === "failed" ? t("actions.idFailedBody") : t("actions.waitingVideoBody");

  const submit = () => {
    if (!valid) return;
    void run(async () => {
      await api(`/bookings/${booking.id}/identity-check`, {
        method: "POST", body: { photoMatched: photo === "yes", physicalDlSeen: card === "yes", dlNumberLast4: last4 },
      });
      setOutcome("ok");
    }, { haptics: true, onError: (err) => {
      if (!(err instanceof ApiError) || err.code !== "identity_check_failed") return false;
      setOutcome("failed");
      return true;
    } });
  };

  return <Sheet open title={t("actions.idTitle")} onClose={onClose} closeLabel={t("common.close")} busy={busy}
    footer={result ? <Button label={t(result === "ok" ? "common.done" : "common.close")} onPress={onClose} />
      : id && !query.isError ? <Button variant="primary" icon={ShieldCheck} label={t("actions.idSubmit")} disabled={!valid} busy={busy} onPress={submit} /> : null}>
    {result ? <Card icon={result === "ok" ? ShieldCheck : result === "failed" ? ShieldAlert : Video}
      title={result === "failed" ? t("actions.idFailedTitle") : result === "waiting" ? t("actions.waitingVideoTitle") : undefined}
      style={{ backgroundColor: result === "failed" ? colors.dangerSoft : result === "ok" ? colors.verifiedSoft : colors.infoSoft }}>
      <Text>{resultBody}</Text>
    </Card> : query.isPending ? <LoadingRows label={t("common.loading")} />
      : query.isError ? <ErrorNote text={errorText(lang, query.error)} retryLabel={t("common.retry")} onRetry={() => void query.refetch()} />
      : <View style={{ gap: space[4] }}>
        <Text color="ink2">{t("actions.idIntro")}</Text>
        <Text weight="bold">1. {t("actions.idStepPhoto")}</Text>
        {id?.photoUrl && !photoFailed ? <Image source={id.photoUrl} cachePolicy="none" contentFit="cover" accessible={false}
          onError={() => setPhotoFailed(true)} style={{ width: 112, height: 144, backgroundColor: colors.surface3, borderRadius: radius.panel }} />
          : <Text color="ink2">{t("actions.idNoPhoto")}</Text>}
        <Text>{t("actions.idName")}: {id?.riderName ?? "—"}</Text>
        <Text>{t("actions.idDob")}: {dateLabel(id?.riderDob, lang)}</Text>
        <Text>{t("actions.idValidTill")}: {dateLabel(id?.licenceExpiresOn, lang)}</Text>
        <Segmented value={photo} onChange={setPhoto} options={options} />
        <Text weight="bold">2. {t("actions.idStepCard")}</Text>
        <Segmented value={card} onChange={setCard} options={options} />
        <Text weight="bold">3. {t("actions.idStepLast4")}</Text>
        {id?.licenceNumberMasked && <Text color="ink2">{t("actions.idOnFile", { masked: id.licenceNumberMasked })}</Text>}
        <Input value={last4} accessibilityLabel={t("actions.idStepLast4")} autoCapitalize="characters" autoCorrect={false}
          maxLength={4} onChangeText={(v) => setLast4(v.replace(/[^0-9A-Za-z]/g, "").toUpperCase())} />
        {error && <ErrorNote text={error} />}
      </View>}
  </Sheet>;
}
