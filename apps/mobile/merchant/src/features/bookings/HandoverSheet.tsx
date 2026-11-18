import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { CheckCircle2, Circle, ShieldAlert, ShieldCheck, Video } from "lucide-react-native";
import {
  ApiError, Button, Card, ErrorNote, Input, LoadingRows, SelectField, Segmented, Sheet, Text,
  api, colors, dateLabel, errorText, radius, space, useT, type Row,
} from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { BookingSummary, useCounterWrite } from "./common";
import { counter } from "../../ui/Counter";

/** A numbered step: a navy circle with the number, then the instruction. */
function Step({ n, label }: { n: number; label: string }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
    <View style={{ width: 32, height: 32, borderRadius: radius.full, backgroundColor: counter.navy, alignItems: "center", justifyContent: "center" }}>
      <Text weight="bold" color="surface">{n}</Text>
    </View>
    <Text weight="bold" size="md" style={{ flex: 1 }} accessibilityRole="header">{label}</Text>
  </View>;
}

/** A tick box row: big target, the tick and the words side by side. */
function Check({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const Icon = checked ? CheckCircle2 : Circle;
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress}
    style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 56, padding: space[3], borderRadius: radius.panel,
      borderWidth: 1, borderColor: checked ? colors.verified : colors.lineStrong, backgroundColor: checked ? colors.verifiedSoft : colors.surface }, pressed && { opacity: 0.75 }]}>
    <Icon size={24} color={checked ? colors.verified : colors.ink3} />
    <Text weight={checked ? "bold" : "regular"} style={{ flex: 1 }}>{label}</Text>
  </Pressable>;
}

type Identity = { riderName: string | null; riderDob: string | null; licenceNumberMasked: string | null; licenceExpiresOn: string | null; photoUrl: string | null; alreadyChecked: boolean; pickupLicenceRequired?: boolean };

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
    footer={<Button variant="primary" size="lg" full icon={CheckCircle2} label={t("actions.walkinHandoverConfirm")} busy={busy}
      onPress={() => void run(async () => { await api(`/bookings/${booking.id}/pickup`, { method: "POST" }); onClose(); }, { haptics: true })} />}>
    <View style={{ gap: space[3] }}>
      <BookingSummary booking={booking} />
      <Text color="ink2">{t("actions.walkinHandoverBody")}</Text>
      <Card title={t("actions.licenceNumber")} style={{ backgroundColor: colors.surface2 }}><Text weight="bold" size="xl" tnum>{String(booking.walkin_dl_number ?? "—")}</Text></Card>
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

  if (id?.pickupLicenceRequired && !id.alreadyChecked && !query.isError) {
    return <PickupLicence booking={booking} riderName={id.riderName} onClose={onClose} />;
  }
  return <Sheet open title={t("actions.idTitle")} onClose={onClose} closeLabel={t("common.close")} busy={busy}
    footer={result ? <Button label={t(result === "ok" ? "common.done" : "common.close")} onPress={onClose} />
      : id && !query.isError ? <Button variant="primary" size="lg" full icon={ShieldCheck} label={t("actions.idSubmit")} disabled={!valid} busy={busy} onPress={submit} /> : null}>
    {result ? <Card icon={result === "ok" ? ShieldCheck : result === "failed" ? ShieldAlert : Video}
      title={result === "failed" ? t("actions.idFailedTitle") : result === "waiting" ? t("actions.waitingVideoTitle") : undefined}
      style={{ backgroundColor: result === "failed" ? colors.dangerSoft : result === "ok" ? colors.verifiedSoft : colors.infoSoft }}>
      <Text>{resultBody}</Text>
    </Card> : query.isPending ? <LoadingRows label={t("common.loading")} />
      : query.isError ? <ErrorNote text={errorText(lang, query.error)} retryLabel={t("common.retry")} onRetry={() => void query.refetch()} />
      : <View style={{ gap: space[4] }}>
        <Text color="ink2">{t("actions.idIntro")}</Text>
        <Step n={1} label={t("actions.idStepPhoto")} />
        {id?.photoUrl && !photoFailed ? <Image source={id.photoUrl} cachePolicy="none" contentFit="cover" accessible={false}
          onError={() => setPhotoFailed(true)} style={{ width: 112, height: 144, backgroundColor: colors.surface3, borderRadius: radius.panel }} />
          : <Text color="ink2">{t("actions.idNoPhoto")}</Text>}
        <View style={{ gap: space[1] }}>
          {([[t("actions.idName"), id?.riderName ?? "—"], [t("actions.idDob"), dateLabel(id?.riderDob, lang)], [t("actions.idValidTill"), dateLabel(id?.licenceExpiresOn, lang)]] as const)
            .map(([label, value]) => <View key={label} style={{ flexDirection: "row", gap: space[2] }}>
              <Text color="ink2" style={{ flex: 1 }}>{label}</Text><Text weight="bold" style={{ flex: 1.4 }}>{value}</Text>
            </View>)}
        </View>
        <Segmented pill value={photo} onChange={setPhoto} options={options} />
        <Step n={2} label={t("actions.idStepCard")} />
        <Segmented pill value={card} onChange={setCard} options={options} />
        <Step n={3} label={t("actions.idStepLast4")} />
        {id?.licenceNumberMasked && <Text color="ink2">{t("actions.idOnFile", { masked: id.licenceNumberMasked })}</Text>}
        <Input value={last4} accessibilityLabel={t("actions.idStepLast4")} autoCapitalize="characters" autoCorrect={false}
          maxLength={4} onChangeText={(v) => setLast4(v.replace(/[^0-9A-Za-z]/g, "").toUpperCase())} />
        {error && <ErrorNote text={error} />}
      </View>}
  </Sheet>;
}

function PickupLicence({ booking, riderName, onClose }: Props & { riderName: string | null }) {
  const { lang, t } = useT();
  const hi = lang === "hi";
  const router = useRouter();
  const { shopId } = useMerchantShop();
  const { busy, error, run } = useCounterWrite();
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [reason, setReason] = useState<"MISSING" | "INVALID" | "MISMATCH" | null>(null);
  const [confirmRefusal, setConfirmRefusal] = useState(false);
  const [result, setResult] = useState<"approved" | "refused">();
  const copy = hi ? [
    "मूल ड्राइविंग लाइसेंस देखा", "लाइसेंस का नाम और फोटो राइडर से मेल खाते हैं", "लाइसेंस इस वाहन और किराये की अवधि के लिए मान्य है",
  ] : ["Original driving licence seen", "Licence name and photo match the rider", "Licence covers this vehicle and is valid through return"];
  const path = `/shops/${shopId}/bookings/${booking.id}/pickup-licence`;
  function submit(refuse: boolean) {
    if (!shopId || (refuse ? !reason : !checks.every(Boolean))) return;
    void run(async () => {
      await api(path, { method: "POST", body: refuse
        ? { decision: "refuse", reason }
        : { decision: "approve", originalSeen: true, photoMatched: true, validForVehicleAndDates: true } });
      setResult(refuse ? "refused" : "approved");
    }, { haptics: true });
  }
  return <Sheet open title={hi ? "पिकअप पर लाइसेंस जाँचें" : "Check the licence at pickup"} closeLabel={t("common.close")} onClose={onClose} busy={busy}
    footer={result ? <Button label={t("common.done")} onPress={onClose} />
      : confirmRefusal ? <View style={{ gap: space[2] }}>
        <Button label={hi ? "बुकिंग रद्द करें" : "Refuse and cancel booking"} variant="danger" busy={busy} onPress={() => submit(true)} />
        <Button label={t("common.cancel")} onPress={() => setConfirmRefusal(false)} disabled={busy} />
      </View> : <Button label={hi ? "लाइसेंस जाँच पूरी करें" : "Approve licence check"} variant="primary" busy={busy}
        disabled={!checks.every(Boolean)} onPress={() => submit(false)} />}>
    <View style={{ gap: space[3] }}>
      {result === "approved" ? <Text>{t("actions.waitingVideoBody")}</Text>
        : result === "refused" ? <Text>{hi ? "बुकिंग रद्द हो गई। रिफंड रद्दीकरण नीति के अनुसार होगा।" : "Booking cancelled. Any refund follows the cancellation policy."}</Text>
        : confirmRefusal ? <Text>{hi ? "वाहन न दें। राइडर पर सामान्य रद्दीकरण नियम लागू होंगे।" : "Do not hand over the vehicle. The usual cancellation charges apply to the rider."}</Text> : <>
          <BookingSummary booking={{ ...booking, rider_name: riderName ?? booking.rider_name }} />
          <Text>{hi ? "पिकअप पर मूल लाइसेंस से ये बातें जाँचें।" : "Compare the original licence with the rider in front of you."}</Text>
          {copy.map((label, index) => <Check key={label} label={label} checked={!!checks[index]}
            onPress={() => setChecks(checks.map((checked, i) => i === index ? !checked : checked))} />)}
          <SelectField compact label={hi ? "यदि वाहन नहीं दे सकते" : "If you can’t hand over"} value={reason} onChange={setReason}
            options={[
              { value: "MISSING", label: hi ? "मूल लाइसेंस नहीं है" : "Original licence missing" },
              { value: "INVALID", label: hi ? "लाइसेंस मान्य नहीं" : "Licence does not cover this rental" },
              { value: "MISMATCH", label: hi ? "लाइसेंस राइडर से मेल नहीं खाता" : "Licence does not match the rider" },
            ]} />
          <Button label={hi ? "बुकिंग रद्द करने की समीक्षा करें" : "Review refusal"} disabled={!reason || busy} onPress={() => setConfirmRefusal(true)} />
          <Button label={hi ? "विवाद या दुकान की समस्या के लिए सहायता" : "Get help with a dispute or shop issue"} variant="ghost"
            onPress={() => { onClose(); router.push({ pathname: "/support", params: { booking: String(booking.id) } }); }} />
        </>}
      {error && <ErrorNote text={error} />}
    </View>
  </Sheet>;
}
