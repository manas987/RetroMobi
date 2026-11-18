import { useRef, useState } from "react";
import { View } from "react-native";
import { useMerchantQuery } from "../../state/query";
import { UserPlus } from "lucide-react-native";
import {
  Button, Card, ErrorNote, LoadingRows, Text, api, errorText, queryClient, space, useT, type Row,
} from "@retromobi/mobile-shared";

export function InvitesForYou({ onAccepted }: { onAccepted: () => Promise<unknown> }) {
  const { t, lang } = useT();
  const q = useMerchantQuery<{ invites: Row[] }>("/invites");
  if (q.isPending) return <LoadingRows rows={1} label={t("common.loading")} />;
  if (q.isError) return <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />;
  if (!q.data.invites.length) return null;
  return <Card title={t("staff.invitesForYou")} icon={UserPlus}>
    <View style={{ gap: space[3] }}>
      {q.data.invites.map((invite) => <Invite key={String(invite.id)} invite={invite} onAccepted={onAccepted} />)}
    </View>
  </Card>;
}

function Invite({ invite, onAccepted }: { invite: Row; onAccepted: () => Promise<unknown> }) {
  const { t, lang, tMaybe } = useT();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await api(`/invites/${invite.id}/respond`, { method: "POST", body: { accept } });
      await queryClient.invalidateQueries({ queryKey: ["merchant"] });
      if (accept) await onAccepted();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return <View style={{ gap: space[2] }}>
    <Text>{t("staff.inviteJoin", { shop: String(invite.shop_name ?? ""), role: tMaybe(`common.role_${invite.role}`) ?? String(invite.role) })}</Text>
    {error && <ErrorNote text={error} />}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      <Button variant="primary" label={t("staff.accept")} disabled={busy} onPress={() => void respond(true)} />
      <Button variant="ghost" label={t("staff.decline")} disabled={busy} onPress={() => void respond(false)} />
    </View>
  </View>;
}
