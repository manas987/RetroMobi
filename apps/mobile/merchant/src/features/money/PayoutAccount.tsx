import { useState } from "react";
import { Landmark } from "lucide-react-native";
import { Button, Card, Sheet, Text, api, useT, type Row } from "@retromobi/mobile-shared";
import { StatusBadge, counterStyles } from "../../ui/Counter";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite } from "../bookings/common";
import { Fields, FormButtons, LabelInput, Pending } from "../fleet/tabs/Fields";

export function PayoutAccount({ onChanged }: { onChanged?: () => void }) {
  const { t } = useT();
  const { can } = useMerchantShop();
  const q = useMerchantQuery<Row | null>(can("payouts:read") ? "/payout-account" : null);
  const [editing, setEditing] = useState(false);
  if (!can("payouts:read")) return <Text>{t("common.askOwner")}</Text>;
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  const account = q.data;
  const status = account?.status === "VERIFIED" ? "good" : account?.status === "PENDING" ? "info" : "bad";
  return <Card style={counterStyles.panel} title={t("money.bankTitle")} icon={Landmark}
    action={can("payouts:write") && !!account && <Button label={t("common.change")} variant="ghost" onPress={() => setEditing(true)} />}>
    <Fields>
      {account ? <>
        <Text weight="bold">{account.account_last4 ? `•••• ${account.account_last4} · ${String(account.ifsc ?? "")}` : "—"}</Text>
        <StatusBadge tone={status} label={t(status === "good" ? "money.bankVerified" : status === "info" ? "money.bankPending" : "money.bankRejected")} />
        {status !== "good" && <Text color="ink2">{t(status === "info" ? "money.bankPendingNote" : "money.bankRejectedNote")}</Text>}
      </> : <Text color="ink2">{t("money.bankNone")}</Text>}
      {can("payouts:write") && !account && <Button label={t("money.addAccount")} onPress={() => setEditing(true)} />}
      {editing && <BankForm replace={!!account} onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChanged?.(); }} />}
    </Fields>
  </Card>;
}

function BankForm({ replace, onClose, onDone }: { replace: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const write = useCounterWrite();
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const valid = name.trim().length >= 3 && account.length > 0 && ifsc.trim().length === 11;
  return <Sheet open title={t(replace ? "money.bankReplaceTitle" : "money.bankAddTitle")} closeLabel={t("common.close")}
    busy={write.busy} onClose={onClose} footer={<FormButtons valid={valid} busy={write.busy} error={write.error} save={() => {
      if (valid) void write.run(async () => {
        await api("/payout-account", { method: "PUT", body: { holderName: name.trim(), accountNumber: account, ifsc: ifsc.trim().toUpperCase() } });
        onDone();
      });
    }} />}>
    <Fields>
      <LabelInput label={t("money.holderName")} value={name} onChangeText={setName} autoComplete="name" />
      <LabelInput label={t("money.accountNumber")} value={account} onChangeText={(v) => setAccount(v.replace(/\D/g, ""))} keyboardType="number-pad" />
      <LabelInput label={t("money.ifsc")} hint={t("money.ifscHint")} value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} maxLength={11} />
      <Text size="xs" color="ink2">{t("money.bankPrivacy")}</Text>
    </Fields>
  </Sheet>;
}
