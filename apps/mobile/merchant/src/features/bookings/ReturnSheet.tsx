import { useState } from "react";
import { View } from "react-native";
import { CheckCircle2, ThumbsUp, TriangleAlert } from "lucide-react-native";
import { Button, Card, ErrorNote, Field, Input, Sheet, Text, api, colors, rupees, space, useT, type Row } from "@retromobi/mobile-shared";
import { BookingSummary, useCounterWrite } from "./common";

export function ReturnSheet({ booking, onClose }: { booking: Row | null; onClose: () => void }) {
  return booking && <ReturnFlow key={String(booking.id)} booking={booking} onClose={onClose} />;
}

function ReturnFlow({ booking, onClose }: { booking: Row; onClose: () => void }) {
  const { t } = useT();
  const walkin = booking.source === "OFFLINE";
  const deposit = Number(booking.deposit_amount ?? 0);
  const [claiming, setClaiming] = useState(false);
  const [receipt, setReceipt] = useState<{ claimed: boolean; released: number } | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const { busy, error, run } = useCounterWrite();
  const paise = Number(amount || 0) * 100;
  const tooMuch = paise > deposit;

  function send(claim: boolean) {
    if (claim && (walkin || !reason.trim() || !Number.isSafeInteger(paise) || paise <= 0 || tooMuch)) return;
    void run(async () => {
      const response = await api<{ depositReleased: number | null }>(`/bookings/${booking.id}/return`, {
        method: "POST", body: claim ? { claim: true, reason: reason.trim(), amount: paise } : { claim: false },
      });
      setReceipt({ claimed: claim, released: response.depositReleased ?? 0 });
    }, { haptics: true });
  }

  const footer = receipt ? <Button variant="dark" label={t("common.done")} onPress={onClose} />
    : claiming ? <View style={{ gap: space[2] }}>
      <Button variant="danger" label={t("actions.claimSubmit")} disabled={!reason.trim() || paise <= 0 || tooMuch} busy={busy} onPress={() => send(true)} />
      <Button variant="ghost" label={t("common.back")} disabled={busy} onPress={() => setClaiming(false)} />
    </View>
    : <View style={{ gap: space[2] }}>
      <Button variant="primary" icon={ThumbsUp} label={t(walkin ? "actions.returnFineWalkin" : "actions.returnFine")} busy={busy} onPress={() => send(false)} />
      {!walkin && <Button icon={TriangleAlert} label={t("actions.returnDamage")} disabled={busy || deposit <= 0} onPress={() => setClaiming(true)} />}
    </View>;
  return <Sheet open title={t("actions.returnTitle")} onClose={receipt ? () => {} : onClose} closeLabel={t("common.close")} busy={busy} footer={footer}>
    {receipt ? <Card icon={CheckCircle2} title={t("actions.receiptTitle")} style={{ backgroundColor: colors.verifiedSoft }}>
      {receipt.claimed ? <Text>{t("actions.claimDone")}</Text>
        : walkin ? <Text>{t("actions.receiptWalkin")}</Text>
        : receipt.released > 0 ? <View style={{ gap: space[2] }}>
          <Text size="xl" weight="bold">{t("actions.receiptDeposit", { amount: rupees(receipt.released) })}</Text>
          <Text>{t("actions.receiptShowCustomer")}</Text>
        </View> : <Text>{t("actions.receiptNoDeposit")}</Text>}
    </Card> : <View style={{ gap: space[3] }}>
      <BookingSummary booking={booking} />
      {claiming ? <>
        <Field label={t("actions.claimReason")}>
          <Input multiline value={reason} onChangeText={setReason} accessibilityLabel={t("actions.claimReason")} placeholder={t("actions.claimReasonHint")} />
        </Field>
        <Field label={t("actions.claimAmount")} hint={t("actions.claimMax", { amount: rupees(deposit) })} error={tooMuch ? t("actions.claimTooMuch") : undefined}>
          <Input keyboardType="number-pad" value={amount} accessibilityLabel={t("actions.claimAmount")} onChangeText={(v) => setAmount(v.replace(/\D/g, ""))} />
        </Field>
        <Text color="info">{t("actions.claimNext")}</Text>
      </> : <>
        <Text weight="medium">{t("actions.returnQuestion")}</Text>
        {!walkin && deposit > 0 && <Text color="ink2">{t("actions.deposit")}: {rupees(deposit)}</Text>}
        <Text size="sm" color="ink2">{t("actions.returnFinalNote")}</Text>
      </>}
      {error && <ErrorNote text={error} />}
    </View>}
  </Sheet>;
}
