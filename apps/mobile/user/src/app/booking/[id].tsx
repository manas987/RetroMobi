import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { AlertTriangle, Bike, Copy, ShieldCheck, MapPin, Navigation, Phone, UserRound, Video, XCircle } from "lucide-react-native";
import { Button, Chip, ConfirmSheet, Line, Text, api, colors, dateTimeLabel, dayLabel, rupees, space, timeLabel, type Row } from "@retromobi/mobile-shared";
import { Card, IconAction, PillCTA, Ticket } from "../../features/RiderSurface";
import { directions } from "../../features/explore/api";
import { stockPhotos } from "../../features/explore/stockPhoto";
import { trail, type } from "../../ui/trail";
import { BookingPage } from "../../features/bookings/BookingPage";
import { bookingLabel, canReview, isPast, liveHold, vehicleName } from "../../features/bookings/bookings";
import { cancellationEstimate } from "../../features/bookings/cancellation";
import { refreshRiderData, useWrite } from "../../state/private";

const cancellationMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default function Detail() {
  return <BookingPage title="" footer={(row) => <PrimaryAction row={row} />}>{(row) => <Booking row={row} />}</BookingPage>;
}

/** The one thing to do next, pinned under the page: pay, confirm pickup, or extend. */
function PrimaryAction({ row }: { row: Row }) {
  const router = useRouter();
  const [now] = useState(Date.now);
  const id = String(row.id);
  const active = !isPast(row) && row.status === "CONFIRMED";
  const needsPickupCheck = !!row.pickup_licence_ack_at && !row.pickup_licence_checked;
  if (liveHold(row, now)) return <PillCTA label="Complete payment" tone="amber" amount={rupees(Number(row.total_amount ?? 0))} caption="Due now"
    onPress={() => router.push({ pathname: "/checkout/pay/[groupId]", params: { groupId: String(row.group_id) } })} />;
  if (!active) return null;
  if (row.actual_pickup_at) return <PillCTA label="Request or check extension" onPress={() => router.push({ pathname: "/booking/[id]/extend", params: { id } })} />;
  if (needsPickupCheck) return null;
  return <PillCTA label="Confirm pickup" icon={Video} onPress={() => router.push({ pathname: "/booking/[id]/pickup", params: { id } })} />;
}

function Booking({ row }: { row: Row }) {
  const router = useRouter();
  const id = String(row.id);
  const [now] = useState(Date.now);
  const [cancelAt, setCancelAt] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const w = useWrite();
  const active = !isPast(row) && row.status === "CONFIRMED";
  const needsPickupCheck = !!row.pickup_licence_ack_at && !row.pickup_licence_checked;
  const deposit = row.deposit_status;
  const refusalCopy: Record<string, string> = {
    PICKUP_LICENCE_MISSING: "The original licence was missing at pickup.",
    PICKUP_LICENCE_INVALID: "The licence did not cover this vehicle or rental period.",
    PICKUP_LICENCE_MISMATCH: "The licence did not match the rider.",
  };
  const refund = rupees(Number(row.deposit_refund_amount ?? 0));
  const estimate = cancelAt === null ? null : cancellationEstimate(
    Date.parse(String(row.scheduled_pickup_at)),
    cancelAt,
    Number(row.rental_amount),
    Number(row.security_deposit_amount),
    Number(row.total_amount),
  );
  return <>
    <View style={styles.head}>
      <View style={styles.thumb}>
        {stockPhotos(String(row.make ?? ""), String(row.model ?? ""))[0] ? <Image source={stockPhotos(String(row.make ?? ""), String(row.model ?? ""))[0]}
          style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : <Bike size={26} color={colors.ink2} />}
      </View>
      <View style={{ flex: 1, gap: space[1], alignItems: "flex-start" }}>
        <Chip {...bookingLabel(row, now)} />
        <Text weight="bold" accessibilityRole="header" style={type.title}>{vehicleName(row)}</Text>
      </View>
    </View>
    <Ticket dark
      from={{ label: "Pickup", day: dayLabel(String(row.scheduled_pickup_at)), time: timeLabel(String(row.scheduled_pickup_at)) }}
      to={{ label: "Return", day: dayLabel(String(row.scheduled_return_at)), time: timeLabel(String(row.scheduled_return_at)) }}
      strip={<>
        <UserRound size={16} color={colors.amber} />
        <Text size="sm" style={{ color: trail.mist, flex: 1 }}>{row.rider_name ? String(row.rider_name) : "Rider"}</Text>
        {!!row.actual_pickup_at && <Text size="sm" weight="bold" color="white">Picked up {timeLabel(String(row.actual_pickup_at))}</Text>}
      </>} />
    {!!row.actual_return_at && <Text size="sm" color="ink2">Returned · {dateTimeLabel(row.actual_return_at)}</Text>}
    <View style={styles.panel}>
      <View style={styles.shopRow}>
        <View style={styles.pin}><MapPin size={18} color={trail.forest} /></View>
        <View style={{ flex: 1 }}>
          <Text weight="bold">{String(row.shop_name)}</Text>
          <Text size="sm" color="ink2">{[row.shop_address, row.shop_city].filter(Boolean).join(", ")}</Text>
        </View>
        {active && (row.actual_pickup_at || Date.parse(String(row.scheduled_return_at)) > now) && typeof row.shop_phone === "string" && /^\+?\d+$/.test(row.shop_phone) &&
          <IconAction icon={Phone} tone="forest" label="Call shop" onPress={() => void Linking.openURL(`tel:${row.shop_phone}`).catch(() => setNotice("Couldn’t open your phone app."))} />}
        <IconAction icon={Navigation} tone="amber" label="Get directions" onPress={() => void Linking.openURL(directions(null, null, [row.shop_name, row.shop_address, row.shop_city].filter(Boolean).join(", "))).catch(() => setNotice("Couldn’t open maps."))} />
      </View>
      {!!row.shop_landmark && <Text color="ink2" size="sm">How to find the shop · {String(row.shop_landmark)}</Text>}
    </View>
    {!!row.pickup_licence_ack_at && !isPast(row) && !row.actual_pickup_at && <Card title={needsPickupCheck ? "Bring your original driving licence" : "Licence checked at the shop"}>
      <Text color="ink2">{needsPickupCheck ? "The shop checks the rider’s original licence before handing over the keys. Once they’ve checked it, refresh here to record your pickup video." : "You’re ready to record your pickup video."}</Text>
      {active && needsPickupCheck && <Button label="Refresh pickup status" busy={w.busy} onPress={() => void w.run(() => refreshRiderData("/bookings"))} />}
    </Card>}
    {canReview(row) && <Button label="Leave a review" onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: String(row.shop_id), reviewBooking: id } })} />}
    <Card title="Price breakdown" style={styles.card}><View style={{ gap: space[2] }}>
      <Cost label="Rental" amount={row.rental_amount} />
      <Cost label="Platform fee" amount={row.platform_fee} />
      {Number(row.discount_amount ?? 0) > 0 && <Cost label="Discount" amount={-Number(row.discount_amount)} />}
      <Cost label="Refundable deposit" amount={row.security_deposit_amount} />
      <Line />
      <Cost label="Total" amount={row.total_amount} bold />
      {Number(row.tax_amount ?? 0) > 0 && <Text size="sm">Includes {rupees(Number(row.tax_amount))} in tax.</Text>}
    </View></Card>
    {!row.deleted_at && (deposit === "HELD" || deposit === "RELEASED") && <View style={styles.deposit}>
      <ShieldCheck size={18} color={colors.verified} />
      <Text size="sm" style={{ flex: 1 }}>{deposit === "HELD" ? "Deposit held — released automatically on a clean return."
        : row.deposit_refund_status === "SUCCEEDED" ? `Deposit refunded — ${refund} back on your original payment method.`
        : `Deposit released — ${refund}. Check the original payment method for the refund.`}</Text>
    </View>}
    {!row.deleted_at && (deposit === "CLAIMED" || deposit === "PARTIALLY_DEDUCTED") && <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
      <View style={styles.noticeHead}><AlertTriangle size={18} color={colors.warning} /><Text weight="bold">Deposit claim</Text></View>
      <Text weight="bold" tnum style={type.title}>−{rupees(Number(row.deposit_deducted_amount ?? 0))}</Text>
      {!!row.deposit_deduction_reason && <Text size="sm" color="ink2">{String(row.deposit_deduction_reason)}</Text>}
      <Button label="Question this in Support" variant="dark" onPress={() => router.navigate("/support")} />
    </View>}
    {!!row.deleted_at && <View style={[styles.notice, { backgroundColor: colors.dangerSoft }]}>
      <View style={styles.noticeHead}><XCircle size={18} color={colors.danger} /><Text weight="bold">Cancelled</Text></View>
      <Text size="sm" color="ink2">{refusalCopy[String(row.cancellation_reason)] ?? String(row.cancellation_reason ?? "This booking was cancelled.")}</Text>
      {Number(row.cancellation_refund_amount ?? 0) > 0 && <View style={styles.refund}>
        <Text size="sm" color="ink2" style={{ flex: 1 }}>Refund to your payment method</Text>
        <Text weight="bold" size="xl" tnum style={{ color: colors.verified }}>{rupees(Number(row.cancellation_refund_amount))}</Text>
      </View>}
      {Number(row.cancellation_penalty_amount ?? 0) > 0 && <Text size="sm" color="ink2">Cancellation fee kept · {rupees(Number(row.cancellation_penalty_amount))}</Text>}
    </View>}
    <View style={styles.idRow}>
      <View style={{ flex: 1 }}>
        <Text size="xs" color="ink2">Booking ID</Text>
        <Text selectable size="sm" numberOfLines={1}>{id}</Text>
      </View>
      <IconAction icon={Copy} tone="soft" label="Copy booking ID" onPress={() => void Clipboard.setStringAsync(id).then(() => setNotice("Booking ID copied.")).catch(() => setNotice("Couldn’t copy. Select the ID to copy it."))} />
    </View>
    {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
    {!isPast(row) && !row.actual_pickup_at && <Button label="Cancel booking" variant="ghost" icon={XCircle} onPress={() => setCancelAt(Date.now())} />}
    <ConfirmSheet open={cancelAt !== null} onClose={() => setCancelAt(null)} title="Cancel this booking?" body={<View style={{ gap: space[2] }}>
      <Text weight="bold">Cancelling releases your vehicle.</Text>
      {row.payment_status === "SUCCEEDED" && estimate ? <>
        <Text size="lg" weight="bold" color="danger">Amount you won’t get back · {cancellationMoney.format(estimate.kept / 100)}</Text>
        <Text weight="bold">Estimated refund · {cancellationMoney.format(estimate.refund / 100)}</Text>
        <Text size="sm" color="ink2">Your refund includes the security deposit. The final amount depends on how close you are to pickup when you confirm.</Text>
      </> : <Text>You haven’t paid for this booking. There’s nothing to refund.</Text>}
    </View>} confirmLabel="Confirm cancellation" cancelLabel="Keep booking" danger busy={w.busy} error={w.error} onConfirm={() => void w.run(async () => {
      await api(`/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      setCancelAt(null);
      await refreshRiderData("/bookings");
    })} />
  </>;
}

function Cost({ label, amount, bold }: { label: string; amount: unknown; bold?: boolean }) {
  return <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space[3] }}>
    <Text color={bold ? "ink" : "ink2"} weight={bold ? "bold" : "regular"} style={{ flex: 1 }}>{label}</Text>
    <Text weight="bold">{rupees(Number(amount ?? 0))}</Text>
  </View>;
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space[3] },
  thumb: { width: 96, height: 80, borderRadius: 22, overflow: "hidden", backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  panel: { borderRadius: 24, backgroundColor: colors.surface2, padding: space[3], gap: space[2], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  shopRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  pin: { width: 38, height: 38, borderRadius: 19, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 24 },
  notice: { borderRadius: 24, padding: space[4], gap: space[2] },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  refund: { flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: colors.surface, borderRadius: 18, padding: space[3], marginTop: space[1] },
  deposit: { flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: colors.verifiedSoft, borderRadius: 20, padding: space[3] },
  idRow: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[1] },
});
