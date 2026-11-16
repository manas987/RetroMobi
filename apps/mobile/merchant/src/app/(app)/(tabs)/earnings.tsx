import { useState } from "react";
import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Chip, EmptyState, ErrorNote, Screen, Tabs, Text, errorText, ranges, rupees, space, useT, type Row } from "@retromobi/mobile-shared";
import { useMerchantShop } from "../../../state/shop";
import { useMerchantQuery } from "../../../state/query";
import { Fields, Pending } from "../../../features/fleet/tabs/Fields";
import { PayoutAccount } from "../../../features/money/PayoutAccount";

const RANGES = ["month", "last", "3m"] as const;
const STATUS = ["all", "PENDING", "PAID", "FAILED"] as const;
const labels = { month: "money.rangeMonth", last: "money.rangeLast", "3m": "money.range3m" } as const;

export default function Earnings() {
  const { t, lang, date, tMaybe } = useT();
  const router = useRouter();
  const { shopId, can } = useMerchantShop();
  const allowed = !!shopId && can("payouts:read");
  const [range, setRange] = useState<(typeof RANGES)[number]>("month");
  const [status, setStatus] = useState<(typeof STATUS)[number]>("all");
  const { from, to } = ranges.rangeDates(range);
  const base = `/shops/${shopId}`;
  const q = useMerchantQuery<{ money?: { paid: number; pending: number; walkinCash: number } }>(allowed ? `${base}/summary?from=${from}&to=${to}` : null);
  const params = new URLSearchParams({ from: new Date(`${from}T00:00:00+05:30`).toISOString(), to: new Date(`${to}T23:59:59+05:30`).toISOString() });
  if (status !== "all") params.set("status", status);
  const payouts = useMerchantQuery<{ payouts: Row[] }>(allowed ? `${base}/payouts?${params}` : null);
  const m = q.data?.money;
  const refresh = () => { void Promise.all([q.refetch(), payouts.refetch()]); };
  return <Screen background="canvas" scroll={false} padded={false}>
    {!allowed ? <EmptyState text={t("money.ownerOnly")} /> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={payouts.data?.payouts ?? []} keyExtractor={(row) => String(row.id)}
      contentContainerStyle={{ padding: space[4], gap: space[3] }} refreshing={q.isRefetching || payouts.isRefetching} onRefresh={refresh}
      ListHeaderComponent={<Fields>
        <Text size="xl" weight="bold" accessibilityRole="header">{t("money.earningsTitle")}</Text>
        <Text color="ink2">{t("money.earningsSubtitle")}</Text>
        <Tabs value={range} onChange={setRange} options={RANGES.map((value) => ({ value, label: t(labels[value]) }))} />
        {!q.isSuccess ? <Pending error={q.error} retry={q.refetch} /> : m && <>
          <Card title={t("money.paid")}><Text size="xl" weight="bold">{rupees(m.paid)}</Text></Card>
          <Card title={t("money.pending")}><Text size="xl" weight="bold">{rupees(m.pending)}</Text><Text color="ink2">{t("money.pendingCaption")}</Text></Card>
          <Card title={t("money.walkinCash")}><Text size="xl" weight="bold">{rupees(m.walkinCash)}</Text><Text color="ink2">{t("money.walkinCashCaption")}</Text></Card>
        </>}
        <PayoutAccount />
        <Text size="lg" weight="bold" accessibilityRole="header">{t("money.payoutsTitle")}</Text>
        <Tabs value={status} onChange={setStatus} options={STATUS.map((value) => ({ value, label: value === "all" ? t("common.all") : t(`money.tab${value}`) }))} />
      </Fields>}
      ListEmptyComponent={!payouts.isSuccess ? <Pending error={payouts.error} retry={payouts.refetch} /> : <EmptyState text={t("money.payoutsEmpty")} />}
      ListFooterComponent={payouts.error && payouts.data ? <ErrorNote text={errorText(lang, payouts.error)} retryLabel={t("common.retry")} onRetry={() => void payouts.refetch()} /> : undefined}
      renderItem={({ item }) => {
        const failed = item.status === "FAILED";
        const paid = item.status === "PAID";
        return <Card title={tMaybe(`money.stage${item.stage}`) ?? t("money.payoutsTitle")}>
          <Fields>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
              <Text size="lg" weight="bold">{rupees(Number(item.amount))}</Text>
              <Chip tone={paid ? "good" : failed ? "bad" : "info"} label={paid ? item.paid_at ? t("money.paidOn", { date: date(item.paid_at) }) : t("money.tabPAID")
                : t(failed ? "money.problem" : "money.onTheWay")} />
            </View>
            <Text size="sm" color="ink2">{date(item.created_at)}</Text>
            {!!item.booking_id && <Button variant="ghost" label={t("bookings.code", { code: String(item.booking_id).slice(0, 8).toUpperCase() })}
              onPress={() => router.push({ pathname: "/booking/[id]", params: { id: String(item.booking_id), shopId: shopId! } })} />}
            {failed && <Text color="danger">{t(/beneficiar|account/i.test(String(item.last_error ?? "")) ? "money.failedBank" : "money.failedRetry")}</Text>}
          </Fields>
        </Card>;
      }} />}
  </Screen>;
}
