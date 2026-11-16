import { useState } from "react";
import { FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, Chip, EmptyState, ErrorNote, LoadingRows, Screen, SelectOptions, Sheet, Text, api, errorText, space, useT, type Row } from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { Fields, FormButtons, LabelInput, Pending } from "../../../features/fleet/tabs/Fields";
import { useCounterWrite, vehicleLabel } from "../../../features/bookings/common";

const categories = ["BOOKING", "APP_HELP", "OTHER"] as const;
type Category = typeof categories[number];

export default function Chats() {
  const { t, tMaybe, lang, date, time } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const [open, setOpen] = useState(false);
  const q = useMerchantQuery<{ tickets: Row[] }>("/tickets", { refetchInterval: 30_000 });
  const tickets = q.data?.tickets ?? [];
  function chat(id: string) { router.push({ pathname: "/chat/[ticketId]", params: { ticketId: id } }); }
  const close = () => { setOpen(false); if (params.booking) router.setParams({ booking: "" }); };
  return <Screen background="canvas" scroll={false} padded={false}>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={tickets} keyExtractor={(row) => String(row.id)} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}
      contentContainerStyle={{ padding: space[4], gap: space[3] }}
      ListHeaderComponent={<Fields>
        <Text size="xl" weight="bold" accessibilityRole="header">{t("nav.support")}</Text>
        <Text color="ink2">{t("support.subtitle")}</Text>
        <Button variant="primary" label={t("support.startChat")} onPress={() => setOpen(true)} />
        {q.error && !!tickets.length && <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />}
      </Fields>}
      ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} /> : q.error ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
        : <EmptyState text={t("support.empty")} />}
      renderItem={({ item }) => {
        const title = String(item.subject || tMaybe(`support.cat${item.category}`) || t("support.conversation"));
        const solved = item.status === "RESOLVED";
        const latest = item.latest_message_at || item.updated_at;
        return <Card title={title}><Fields>
          <Chip label={t(solved ? "support.solved" : item.status === "WAITING_ON_MERCHANT" ? "support.waitingReply" : "support.open")} tone={solved ? "muted" : "info"} />
          {item.latest_message != null && <Text color="ink2" numberOfLines={2}>{String(item.latest_message)}</Text>}
          {latest != null && <Text size="xs" color="ink2">{date(latest)} · {time(latest)}</Text>}
          <Button label={t("support.conversation")} variant="ghost" onPress={() => chat(String(item.id))} />
        </Fields></Card>;
      }} />
    {(open || !!params.booking) && <NewChat preset={params.booking} onClose={close} onCreated={(id) => { close(); chat(id); }} />}
  </Screen>;
}

function NewChat({ preset, onClose, onCreated }: { preset?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { t, date } = useT();
  const { shopId } = useMerchantShop();
  const [category, setCategory] = useState<Category>(preset ? "BOOKING" : "APP_HELP");
  const [booking, setBooking] = useState(preset ?? "");
  const [message, setMessage] = useState("");
  const [picker, setPicker] = useState<"category" | "booking" | null>(null);
  const write = useCounterWrite();
  const bookings = useMerchantQuery<{ bookings: Row[] }>(category === "BOOKING" && shopId ? `/shops/${shopId}/bookings` : null);
  const bookingLabel = (item: Row) => `${vehicleLabel(item)} · ${date(item.scheduled_pickup_at)}`;
  const options = (bookings.data?.bookings ?? []).map((item) => ({ value: String(item.id), label: bookingLabel(item) }));
  const valid = category !== "BOOKING" || !!booking;
  return <Sheet open scroll={!picker} title={t(picker === "category" ? "support.whatAbout" : picker === "booking" ? "support.whichBooking" : "support.newTitle")}
    closeLabel={t("common.close")} onClose={picker ? () => setPicker(null) : onClose} busy={write.busy}
    footer={!picker && <FormButtons label={t("support.start")} valid={valid} busy={write.busy} error={write.error} save={() => {
      if (valid) void write.run(async () => {
        const result = await api<{ id: string }>("/tickets", { method: "POST", body: {
          category, bookingId: category === "BOOKING" ? booking : undefined, firstMessage: message.trim() || undefined,
        } });
        onCreated(result.id);
      });
    }} />}>
    {picker === "category" ? <SelectOptions value={category} options={categories.map((value) => ({ value, label: t(`support.cat${value}`) }))}
      onChange={(value) => { setCategory(value); setPicker(null); }} /> : picker === "booking"
      ? <SelectOptions value={booking} options={options} onChange={(id) => { setBooking(id); setPicker(null); }} />
      : <Fields>
        <Text color="ink2">{t("support.whatAbout")}</Text>
        <Button label={t(`support.cat${category}`)} onPress={() => setPicker("category")} />
        {category === "BOOKING" && <>
          <Text color="ink2">{t("support.whichBooking")}</Text>
          {bookings.isSuccess ? <Button label={options.find((item) => item.value === booking)?.label ?? (booking ? `#${booking.slice(0, 8).toUpperCase()}` : t("support.pickBooking"))}
            disabled={!options.length} onPress={() => setPicker("booking")} /> : <Pending error={bookings.error} retry={bookings.refetch} />}
        </>}
        <LabelInput multiline label={t("support.firstMessage")} value={message} onChangeText={setMessage} />
      </Fields>}
  </Sheet>;
}
