import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { ArrowDownLeft, Banknote, ChevronRight, Clock3, IndianRupee } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Card, colors, radius, EmptyState, ErrorNote, Screen, Tabs, Text, errorText, ranges, rupees, space, useT, type Row } from "@retromobi/mobile-shared";
import { HeroCard, PageTitle, StatusBadge, counterStyles } from "../../../ui/Counter";
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
        <PageTitle title={t("money.earningsTitle")} subtitle={t("money.earningsSubtitle")} />
        <Tabs pill wrap value={range} onChange={setRange} options={RANGES.map((value) => ({ value, label: t(labels[value]) }))} />
        {!q.isSuccess ? <Pending error={q.error} retry={q.refetch} /> : m && <>
          <HeroCard label={t("money.paid")} value={rupees(m.paid)} icon={IndianRupee} />
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <Card style={{ ...counterStyles.panel, flex: 1, padding: space[3] }}>
              <Clock3 size={19} color={colors.info} /><Text size="sm" weight="medium">{t("money.pending")}</Text>
              <Text size="lg" weight="bold" tnum>{rupees(m.pending)}</Text><Text size="xs" color="ink2">{t("money.pendingCaption")}</Text>
            </Card>
            <Card style={{ ...counterStyles.panel, flex: 1, padding: space[3] }}>
              <Banknote size={19} color={colors.verified} /><Text size="sm" weight="medium">{t("money.walkinCash")}</Text>
              <Text size="lg" weight="bold" tnum>{rupees(m.walkinCash)}</Text><Text size="xs" color="ink2">{t("money.walkinCashCaption")}</Text>
            </Card>
          </View>
        </>}
        <PayoutAccount />
        <Text size="lg" weight="bold" accessibilityRole="header">{t("money.payoutsTitle")}</Text>
        <Tabs pill wrap value={status} onChange={setStatus} options={STATUS.map((value) => ({ value, label: value === "all" ? t("common.all") : t(`money.tab${value}`) }))} />
      </Fields>}
      ListEmptyComponent={!payouts.isSuccess ? <Pending error={payouts.error} retry={payouts.refetch} /> : <EmptyState text={t("money.payoutsEmpty")} />}
      ListFooterComponent={payouts.error && payouts.data ? <ErrorNote text={errorText(lang, payouts.error)} retryLabel={t("common.retry")} onRetry={() => void payouts.refetch()} /> : undefined}
      renderItem={({ item }) => {
        const failed = item.status === "FAILED";
        const paid = item.status === "PAID";
        const open = item.booking_id ? () => router.push({ pathname: "/booking/[id]", params: { id: String(item.booking_id), shopId: shopId! } }) : undefined;
        return <Pressable disabled={!open} onPress={open} accessibilityRole={open ? "button" : undefined}
          style={({ pressed }) => [{ ...counterStyles.group, padding: space[3], gap: space[2] }, pressed && { opacity: 0.75 }]}>
          <View style={counterStyles.row}>
            <View style={{ width: 44, height: 44, borderRadius: radius.full, alignItems: "center", justifyContent: "center",
              backgroundColor: paid ? colors.verifiedSoft : failed ? colors.dangerSoft : colors.infoSoft }}>
              <ArrowDownLeft size={20} color={paid ? colors.verified : failed ? colors.danger : colors.info} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text weight="bold">{tMaybe(`money.stage${item.stage}`) ?? t("money.payoutsTitle")}</Text>
              <Text size="sm" color="ink2" tnum>{date(item.created_at)}{item.booking_id ? ` · ${t("bookings.code", { code: String(item.booking_id).slice(0, 8).toUpperCase() })}` : ""}</Text>
            </View>
            <Text size="lg" weight="bold" tnum>{rupees(Number(item.amount))}</Text>
            {open && <ChevronRight size={18} color={colors.ink2} />}
          </View>
          <StatusBadge tone={paid ? "good" : failed ? "bad" : "info"} label={paid ? item.paid_at ? t("money.paidOn", { date: date(item.paid_at) }) : t("money.tabPAID")
            : t(failed ? "money.problem" : "money.onTheWay")} />
          {failed && <Text color="danger">{t(/beneficiar|account/i.test(String(item.last_error ?? "")) ? "money.failedBank" : "money.failedRetry")}</Text>}
        </Pressable>;
      }} />}
  </Screen>;
}
