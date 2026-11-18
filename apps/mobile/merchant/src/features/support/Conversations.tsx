import { useState } from "react";
import { CalendarCheck, CircleHelp, MessageCircle, Plus } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, EmptyState, ErrorNote, LoadingRows, Screen, SelectOptions, SelectTrigger, Sheet, Tabs, Text, api, errorText, space, useT, type Row } from "@retromobi/mobile-shared";
import { CounterRowLink, IconAction, PageTitle, StatusBadge, counterStyles } from "../../ui/Counter";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { Fields, FormButtons, LabelInput, Pending } from "../fleet/tabs/Fields";
import { useCounterWrite, vehicleLabel } from "../bookings/common";
import { art } from "../../ui/art";

const categories = ["BOOKING", "APP_HELP", "OTHER"] as const;
type Category = typeof categories[number];

export function Conversations({ inTab = false }: { inTab?: boolean }) {
  const { t, tMaybe, lang, date, time } = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ booking?: string }>();
  const [open, setOpen] = useState(false);
  const q = useMerchantQuery<{ tickets: Row[] }>("/tickets", { refetchInterval: 30_000 });
  const tickets = q.data?.tickets ?? [];
  function chat(id: string) { router.push({ pathname: "/chat/[ticketId]", params: { ticketId: id } }); }
  const close = () => { setOpen(false); if (params.booking) router.setParams({ booking: "" }); };
  return <Screen background="canvas" scroll={false} padded={false} edges={inTab ? ["top", "left", "right"] : ["bottom", "left", "right"]}>
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={tickets} keyExtractor={(row) => String(row.id)} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}
      contentContainerStyle={{ padding: space[4], gap: space[3] }}
      ListHeaderComponent={<Fields>
        <PageTitle title={t("nav.support")} subtitle={t("support.subtitle")}
          action={<IconAction icon={Plus} label={t("support.startChat")} primary onPress={() => setOpen(true)} />} />
        {q.error && !!tickets.length && <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />}
      </Fields>}
      ListEmptyComponent={q.isPending ? <LoadingRows label={t("common.loading")} /> : q.error ? <ErrorNote text={errorText(lang, q.error)} retryLabel={t("common.retry")} onRetry={() => void q.refetch()} />
        : <EmptyState image={art.emptyBookings} text={t("support.empty")} action={<Button label={t("support.startChat")} icon={Plus} onPress={() => setOpen(true)} />} />}
      renderItem={({ item }) => {
        const title = String(item.subject || tMaybe(`support.cat${item.category}`) || t("support.conversation"));
        const solved = item.status === "RESOLVED";
        const latest = item.latest_message_at || item.updated_at;
        return <View style={counterStyles.group}>
          <CounterRowLink icon={item.category === "BOOKING" ? CalendarCheck : MessageCircle} title={title}
            detail={[item.latest_message, latest != null ? `${date(latest)} · ${time(latest)}` : null].filter(Boolean).join("\n")}
            trailing={<StatusBadge label={t(solved ? "support.solved" : item.status === "WAITING_ON_MERCHANT" ? "support.waitingReply" : "support.open")}
              tone={solved ? "good" : "info"} />} onPress={() => chat(String(item.id))} />
        </View>;
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
  const [picker, setPicker] = useState<"booking" | null>(null);
  const write = useCounterWrite();
  const bookings = useMerchantQuery<{ bookings: Row[] }>(category === "BOOKING" && shopId ? `/shops/${shopId}/bookings` : null);
  const bookingLabel = (item: Row) => `${vehicleLabel(item)} · ${date(item.scheduled_pickup_at)}`;
  const options = (bookings.data?.bookings ?? []).map((item) => ({ value: String(item.id), label: bookingLabel(item) }));
  const valid = category !== "BOOKING" || !!booking;
  return <Sheet open scroll={!picker} title={t(picker === "booking" ? "support.whichBooking" : "support.newTitle")}
    closeLabel={t("common.close")} onClose={picker ? () => setPicker(null) : onClose} busy={write.busy}
    footer={!picker && <FormButtons label={t("support.start")} valid={valid} busy={write.busy} error={write.error} save={() => {
      if (valid) void write.run(async () => {
        const result = await api<{ id: string }>("/tickets", { method: "POST", body: {
          category, bookingId: category === "BOOKING" ? booking : undefined, firstMessage: message.trim() || undefined,
        } });
        onCreated(result.id);
      });
    }} />}>
    {picker === "booking" ? <SelectOptions value={booking} options={options} onChange={(id) => { setBooking(id); setPicker(null); }} />
      : <Fields>
        <View style={counterStyles.row}><CircleHelp size={20} /><Text weight="bold">{t("support.whatAbout")}</Text></View>
        <Tabs pill wrap value={category} options={categories.map((value) => ({ value, label: t(`support.cat${value}`) }))} onChange={setCategory} />
        {category === "BOOKING" && <>
          {bookings.isSuccess ? <SelectTrigger compact label={t("support.whichBooking")} placeholder={t("support.pickBooking")}
            value={options.find((item) => item.value === booking)?.label ?? (booking ? `#${booking.slice(0, 8).toUpperCase()}` : undefined)}
            disabled={!options.length} onPress={() => setPicker("booking")} /> : <Pending error={bookings.error} retry={bookings.refetch} />}
        </>}
        <LabelInput multiline label={t("support.firstMessage")} value={message} onChangeText={setMessage} />
      </Fields>}
  </Sheet>;
}
