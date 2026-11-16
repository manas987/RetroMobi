import { useState } from "react";
import { FlatList, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { setStringAsync } from "expo-clipboard";
import {
  ApiError, Button, Chip, EmptyState, ErrorNote, Input, LoadingRows, Screen, Text, api, colors, dateLabel,
  decodeJwtSubject, errorText, istDay, queryClient, radius, space, uploadFile, useSession, useT, useToast, type PickedFile, type Row,
} from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../../state/query";
import { useCounterWrite } from "../../../features/bookings/common";
import { pickPaper } from "../../../features/fleet/files";

type History = { messages: Row[] };
export default function Chat() {
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  return <ChatBody key={ticketId} id={ticketId} />;
}

function ChatBody({ id }: { id: string }) {
  const { t, tMaybe, lang, time } = useT();
  const toast = useToast();
  const session = useSession();
  const subject = session && decodeJwtSubject(session.accessToken);
  const key = ["merchant", `/tickets/${id}/messages`, subject];
  const ticket = useMerchantQuery<Row>(`/tickets/${encodeURIComponent(id)}`);
  const base = `/tickets/${encodeURIComponent(id)}/messages`;
  const q = useQuery({
    queryKey: key,
    queryFn: async ({ signal, client }) => {
      const previous = client.getQueryData<History>(key)?.messages ?? [];
      const lastId = previous.at(-1)?.id;
      const result = await api<History>(lastId ? `${base}?since=${encodeURIComponent(String(lastId))}` : base, { signal });
      const byId = new Map(previous.map((row) => [row.id, row]));
      result.messages.forEach((row) => byId.set(row.id, row));
      return { messages: [...byId.values()] };
    },
    enabled: !!id,
    refetchInterval: ({ state }) => state.error instanceof ApiError && state.error.status === 429
      ? Math.max(4000, state.errorUpdatedAt + 1000 * (state.error.retryAfterSeconds ?? 30) - Date.now()) : 4000,
  });
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState<{ id: string; file: PickedFile } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const write = useCounterWrite();
  const rows = [...(q.data?.messages ?? [])].reverse();
  const title = String(ticket.data?.subject || tMaybe(`support.cat${ticket.data?.category}`) || t("support.conversation"));

  async function sendAttachment(message: { id: string; file: PickedFile }) {
    try {
      const path = `${base}/${message.id}/attachments`;
      await uploadFile({ file: message.file, presignPath: `${path}/upload`, confirmPath: `${path}/confirm`,
        confirmBody: { fileName: message.file.name, sizeBytes: message.file.size } });
      setAttach(null); setAttachError(null);
    } catch {
      setAttach(message); setAttachError(t("support.attachFailed"));
    }
    // Re-read the message from the server so an attachment added to an existing row appears.
    const result = await api<History>(base);
    queryClient.setQueryData(key, result);
  }

  function send(withFile: boolean) {
    if (!withFile && !body.trim()) return;
    void write.run(async () => {
      if (withFile && attach) { await sendAttachment(attach); return; }
      const file = withFile ? await pickPaper() : null;
      if (withFile && !file) return;
      const result = await api<Row>(base, { method: "POST", body: { body: body.trim() || t("support.attached", { name: file?.name ?? t("common.uploadFile") }) } });
      setBody("");
      if (file) await sendAttachment({ id: String(result.id), file });
      else await q.refetch();
    });
  }

  return <Screen scroll={false} padded={false} background="canvas" edges={["bottom", "left", "right"]} footer={ticket.isSuccess && <View style={{ gap: space[2] }}>
    {write.error && <ErrorNote text={write.error} />}
    {attachError && <ErrorNote text={attachError} retryLabel={t("common.retry")} onRetry={() => send(true)} />}
    <Input value={body} accessibilityLabel={t("support.typeMessage")} onChangeText={setBody} placeholder={t("support.typeMessage")} multiline editable={!write.busy} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      <Button label={t("support.attach")} disabled={write.busy || !!attach} onPress={() => send(true)} />
      <Button label={t("support.send")} variant="primary" busy={write.busy} disabled={!body.trim()} onPress={() => send(false)} />
    </View>
  </View>}>
    <Stack.Screen options={{ title }} />
    <View style={{ padding: space[3], gap: space[2], backgroundColor: colors.surface }}>
      {ticket.error && <ErrorNote text={errorText(lang, ticket.error)} retryLabel={t("common.retry")} onRetry={() => void ticket.refetch()} />}
      {ticket.data && <Chip tone={ticket.data.status === "RESOLVED" ? "muted" : "info"} label={t(ticket.data.status === "RESOLVED" ? "support.solved" : "support.open")} />}
      {ticket.data?.booking_id != null && <Button variant="ghost" label={t("bookings.code", { code: String(ticket.data.booking_id).slice(0, 8).toUpperCase() })}
        onPress={() => { void setStringAsync(String(ticket.data?.booking_id)).then((ok) => toast(ok ? (lang === "hi" ? "कॉपी किया" : "Copied") : t("common.couldntLoad"))).catch(() => toast(t("common.couldntLoad"))); }} />}
      {q.error && !!rows.length && <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />}
    </View>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} inverted data={rows} keyExtractor={(row) => String(row.id)} contentContainerStyle={{ padding: space[4], gap: space[2] }}
      keyboardShouldPersistTaps="handled" onRefresh={() => void q.refetch()} refreshing={q.isRefetching}
      ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} /> : q.error ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
        : <EmptyState text={t("support.noMessages")} />}
      renderItem={({ item, index }) => {
        const day = istDay(new Date(String(item.created_at)));
        const older = rows[index + 1];
        const mine = item.sender_type === "MERCHANT" && item.sender_id === subject;
        const system = item.sender_type === "SYSTEM";
        return <View>
          {(!older || istDay(new Date(String(older.created_at))) !== day) && <Text size="xs" center color="ink2" style={{ marginVertical: space[2] }}>{dateLabel(day, lang)}</Text>}
          <View style={{ alignSelf: system ? "center" : mine ? "flex-end" : "flex-start", maxWidth: "88%", padding: space[3], borderRadius: radius.panel,
            backgroundColor: system ? colors.canvas : mine ? colors.amberSoft : colors.surface, gap: space[1] }}>
            {!mine && !system && <Text size="xs" weight="bold" color="ink2">{item.sender_type === "MERCHANT" ? t("nav.staff") : t("support.fromSupport")}</Text>}
            <Text size={system ? "sm" : "base"}>{String(item.body ?? "")}</Text>
            {Array.isArray(item.attachments) && (item.attachments as Row[]).map((file) => <Text size="sm" weight="medium" key={String(file.id)}>{String(file.file_name ?? t("common.uploadFile"))}</Text>)}
            <Text size="xs" color="ink2">{time(item.created_at)}</Text>
          </View>
        </View>;
      }} />
  </Screen>;
}
