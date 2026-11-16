import { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { Copy } from "lucide-react-native";
import { Button, Chip, ConfirmSheet, Line, Text, api, dateTimeLabel, rupees, space, type Row } from "@retromobi/mobile-shared";
import { Card, IconAction } from "../../features/RiderSurface";
import { BookingPage } from "../../features/bookings/BookingPage";
import { bookingLabel, canReview, isPast, liveHold, vehicleName } from "../../features/bookings/bookings";
import { cancellationEstimate } from "../../features/bookings/cancellation";
import { refreshRiderData, useWrite } from "../../state/private";

const cancellationMoney = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default function Detail() {
  return <BookingPage title="Booking details">{(row) => <Booking row={row} />}</BookingPage>;
}

function Booking({ row }: { row: Row }) {
  const router = useRouter();
  const id = String(row.id);
  const [now] = useState(Date.now);
  const [cancelAt, setCancelAt] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const w = useWrite();
  const active = !isPast(row) && row.status === "CONFIRMED";
  const needsPickupCheck = !!row.pickup_verification_session_id && !row.pickup_licence_checked;
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
    <Text size="xl" weight="bold" accessibilityRole="header">{vehicleName(row)}</Text>
    <Chip {...bookingLabel(row, now)} />
    <Card title={String(row.shop_name)}><View style={{ gap: space[2] }}>
      <Text>{[row.shop_address, row.shop_city].filter(Boolean).join(", ")}</Text>
      {!!row.shop_landmark && <Text>How to find the shop: {String(row.shop_landmark)}</Text>}
      {typeof row.shop_phone === "string" && /^\+?\d+$/.test(row.shop_phone) &&
        <Button label={`Call shop · ${row.shop_phone}`} onPress={() => void Linking.openURL(`tel:${row.shop_phone}`).catch(() => setNotice("Couldn’t open your phone app."))} />}
      <Text>{row.rider_name ? `Rider: ${row.rider_name}` : ""}</Text>
      <Text>Scheduled pickup · {dateTimeLabel(row.scheduled_pickup_at)}</Text>
      {!!row.actual_pickup_at && <Text>Picked up · {dateTimeLabel(row.actual_pickup_at)}</Text>}
      <Text>Scheduled return · {dateTimeLabel(row.scheduled_return_at)}</Text>
      {!!row.actual_return_at && <Text>Returned · {dateTimeLabel(row.actual_return_at)}</Text>}
    </View></Card>
    {!!row.pickup_verification_session_id && !isPast(row) && !row.actual_pickup_at && <Card title={needsPickupCheck ? "Bring your original driving licence" : "Licence checked at the shop"}>
      <Text color="ink2">{needsPickupCheck ? "Show the rider’s original licence to the shop. When they’ve checked it, refresh here to continue to pickup." : "You’re ready to record your pickup video."}</Text>
      {active && needsPickupCheck && <Button label="Refresh pickup status" busy={w.busy} onPress={() => void w.run(() => refreshRiderData("/bookings"))} />}
    </Card>}
    {liveHold(row, now) && <Button label="Complete payment" variant="primary" onPress={() => router.push({ pathname: "/checkout/pay/[groupId]", params: { groupId: String(row.group_id) } })} />}
    {active && (row.actual_pickup_at
      ? <Button label="Request or check extension" variant="primary" onPress={() => router.push({ pathname: "/booking/[id]/extend", params: { id } })} />
      : !needsPickupCheck && <Button label="Confirm pickup" variant="primary" onPress={() => router.push({ pathname: "/booking/[id]/pickup", params: { id } })} />)}
    {canReview(row) && <Button label="Leave a review" onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: String(row.shop_id), reviewBooking: id } })} />}
    <Card title="Price breakdown"><View style={{ gap: space[2] }}>
      <Cost label="Rental" amount={row.rental_amount} />
      <Cost label="Platform fee" amount={row.platform_fee} />
      {Number(row.discount_amount ?? 0) > 0 && <Cost label="Discount" amount={-Number(row.discount_amount)} />}
      <Cost label="Refundable deposit" amount={row.security_deposit_amount} />
      <Line />
      <Cost label="Total" amount={row.total_amount} bold />
      {Number(row.tax_amount ?? 0) > 0 && <Text size="sm">Includes {rupees(Number(row.tax_amount))} in tax.</Text>}
    </View></Card>
    {!row.deleted_at && deposit === "HELD" && <Text>Deposit held — released automatically on a clean return.</Text>}
    {!row.deleted_at && deposit === "RELEASED" && <Text>{row.deposit_refund_status === "SUCCEEDED"
      ? `Deposit refunded — ${refund} back on your original payment method.`
      : `Deposit released — ${refund}. Check the original payment method for the refund.`}</Text>}
    {!row.deleted_at && (deposit === "CLAIMED" || deposit === "PARTIALLY_DEDUCTED") && <Card title="Deposit claim">
      <Text>{rupees(Number(row.deposit_deducted_amount ?? 0))} deducted. {String(row.deposit_deduction_reason ?? "")}</Text>
      <Button label="Go to Support" onPress={() => router.navigate("/support")} />
    </Card>}
    {!!row.deleted_at && <Card title="Cancellation">
      <Text>{refusalCopy[String(row.cancellation_reason)] ?? String(row.cancellation_reason ?? "This booking was cancelled.")}</Text>
      {Number(row.cancellation_refund_amount ?? 0) > 0 && <Text>Refund recorded · {rupees(Number(row.cancellation_refund_amount))}</Text>}
      {Number(row.cancellation_penalty_amount ?? 0) > 0 && <Text>Cancellation fee · {rupees(Number(row.cancellation_penalty_amount))}</Text>}
    </Card>}
    {!isPast(row) && !row.actual_pickup_at && <Button label="Cancel booking" variant="danger" onPress={() => setCancelAt(Date.now())} />}
    <Card title="Booking ID">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Text selectable size="sm" style={{ flex: 1 }}>{id}</Text>
        <IconAction icon={Copy} label="Copy booking ID" onPress={() => void Clipboard.setStringAsync(id).then(() => setNotice("Booking ID copied.")).catch(() => setNotice("Couldn’t copy. Select the ID to copy it."))} />
      </View>
      {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
    </Card>
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
