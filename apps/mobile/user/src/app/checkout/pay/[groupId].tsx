import { useEffect, useRef, useState } from "react";
import { NotificationFeedbackType, notificationAsync } from "expo-haptics";
import { AppState, StyleSheet, View } from "react-native";
import { Clock3, LockKeyhole } from "lucide-react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, ErrorNote, Line, LoadingRows, Screen, Text,
  api, colors, dateTimeLabel, errorMessage, radius, rupees, space, useSession,
} from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../../features/RiderSurface";
import { usePrivate, useWrite } from "../../../state/private";
import { paymentOutcome, type PaymentIntent, type PaymentStatus } from "../../../features/checkout/payment";
import { checkPayment, openPayment } from "../../../features/checkout/cashfree";

export default function Pay() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const session = useSession();
  const path = `/payments/status/${encodeURIComponent(groupId ?? "")}`;
  const q = usePrivate<PaymentStatus>(groupId ? path : null);
  const status = q.data;
  const w = useWrite();
  const mounted = useRef(true);
  const polling = useRef(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const [launched, setLaunched] = useState(false);
  const expiresAt = status?.holdExpiresAt;

  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function check() {
    if (!mounted.current || polling.current) return;
    polling.current = true; setChecking(true); setNotice("");
    void checkPayment(
      async () => (await q.refetch({ throwOnError: true, cancelRefetch: false })).data,
      (next) => !!next && ["confirmed", "paidWithoutBooking", "failed", "expired"].includes(paymentOutcome(next, Date.now())),
      () => mounted.current,
    ).catch((err) => { if (mounted.current) setNotice(errorMessage(err)); }).finally(() => {
      polling.current = false;
      if (mounted.current) setChecking(false);
    });
  }
  const refetch = q.refetch;
  useEffect(() => {
    if (!session || !groupId) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && launched && !polling.current) void refetch({ cancelRefetch: false });
    });
    return () => sub.remove();
  }, [session, groupId, refetch, launched]);

  function pay() {
    void w.run(async () => {
      setNotice("");
      const intent = await api<PaymentIntent>("/payments/intent", { method: "POST", body: { groupId } });
      setLaunched(true);
      try { await openPayment(intent, check); }
      catch (err) { setLaunched(false); throw err; }
    });
  }
  const remaining = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : 0;
  const outcome = status ? paymentOutcome(status, now) : null;
  useEffect(() => {
    if (launched && (outcome === "confirmed" || outcome === "failed" || outcome === "paidWithoutBooking")) {
      void notificationAsync(outcome === "confirmed" ? NotificationFeedbackType.Success : NotificationFeedbackType.Error).catch(() => {});
    }
  }, [launched, outcome]);
  const actionable = outcome === "ready" || outcome === "failed" || (outcome === "pending" && status?.orderStatus === "ACTIVE");
  const showPayment = outcome === "ready" || outcome === "pending" || outcome === "failed";
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }} footer={showPayment && <View style={{ gap: space[1] }}>
    {actionable && <Button label={outcome === "pending" ? "Reopen payment" : outcome === "failed" ? "Try payment again" : `Pay ${rupees(status?.totalAmount ?? 0)}`}
      icon={LockKeyhole} variant="primary" busy={w.busy}
      disabled={checking || !!q.error || (outcome === "ready" && launched) || remaining === 0} onPress={pay} />}
    {(launched || outcome !== "ready" || q.error) && <Button label="Check payment status" variant="ghost"
      busy={checking || q.isFetching} disabled={w.busy} onPress={() => void q.refetch()} />}
  </View>}>
    <Stack.Screen options={{ title: "Payment" }} />
    {!session ? <EmptyState title="Sign in to pay" text="Use the account you booked with to find your payment."
      action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : !groupId ? <EmptyState title="Booking not found" action={<Button label="Go to Bookings" onPress={() => router.replace("/bookings")} />} />
      : q.isPending ? <LoadingRows label="Loading your booking" />
      : q.error && !status ? <ErrorNote text={errorMessage(q.error, "We can’t find this booking. It may have expired.")} onRetry={() => void q.refetch()} />
      : status && <>
        {outcome === "confirmed" ? <EmptyState title="Booking confirmed" text="Your pickup instructions are in Bookings." action={<Button label="View bookings" onPress={() => router.replace("/bookings")} />} />
          : outcome === "paidWithoutBooking" ? <EmptyState title="Payment received, but booking not confirmed" text="Check your bookings or contact support about this payment." action={<Button label="Contact support" onPress={() => router.replace("/support")} />} />
          : outcome === "expired" ? <EmptyState title="This hold has ended" text="Search again to see what’s available for your dates." action={<Button label="Browse vehicles" onPress={() => router.replace("/browse")} />} />
          : <>
            <View style={{ paddingVertical: space[3], gap: space[2] }}>
              <Text size="sm" color="ink2" weight="medium">Amount due</Text>
              <Text size="display" weight="bold" accessibilityRole="header">{rupees(status.totalAmount ?? 0)}</Text>
              {expiresAt && <View style={styles.hold}>
                <Clock3 size={18} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text size="sm" weight="bold">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} left on your hold</Text>
                  <Text size="xs" color="ink2">Held until {dateTimeLabel(expiresAt)}</Text>
                </View>
              </View>}
            </View>
            {(notice || w.error || q.error) && <ErrorNote text={notice || w.error || errorMessage(q.error)} />}
            {outcome === "failed" && <Text>Payment didn’t go through. If money left your account, check the status before paying again.</Text>}
            {(outcome === "pending" || checking) && <Text>{checking || status.orderStatus !== "ACTIVE"
              ? "We’re checking your payment. If you’ve paid, wait for confirmation."
              : "Payment is still open. If you’ve already paid, check the status before trying again."}</Text>}
            <Card title="Your booking"><View style={{ gap: space[3] }}>
              {status.items.map((row, i) => <View key={i} style={{ gap: space[1] }}>
                {i > 0 && <Line />}
                <Text weight="bold">{row.make} {row.model}</Text>
                <Text size="sm" color="ink2">{row.shopName}{row.riderName ? ` · ${row.riderName}` : ""}</Text>
              </View>)}
            </View></Card>
            <Card title="Price breakdown"><View style={{ gap: space[2] }}>
              <Price label="Rental" value={rupees(status.totals.rentalAmount)} />
              <Price label="Platform fee" value={rupees(status.totals.platformFee)} />
              {!!status.totals.discountAmount && <Price label="Discount" value={`−${rupees(status.totals.discountAmount)}`} />}
              <Price label="Refundable deposit" value={rupees(status.totals.securityDepositAmount)} />
              <Line />
              <Price label="Total" value={rupees(status.totalAmount ?? 0)} bold />
            </View></Card>
          </>}
      </>}
  </Screen>;
}

function Price({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space[3] }}>
    <Text color={bold ? "ink" : "ink2"} weight={bold ? "bold" : "regular"} style={{ flex: 1 }}>{label}</Text>
    <Text weight="bold">{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  hold: { flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: colors.surface3, borderRadius: radius.panel, padding: space[3] },
});
