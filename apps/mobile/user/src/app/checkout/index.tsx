import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ApiError, Button, Chip, DateRangeSheet, ErrorNote, Line, LoadingRows, Screen, SelectField, Text,
  api, dateLabel, dateTimeLabel, defaultWindow, errorMessage, istDay, space, useSession, type Row,
} from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../features/RiderSurface";
import { useCart } from "../../state/cart";
import { usePrivate, useWrite } from "../../state/private";
import { canRide, pickupLicenceTerms } from "../../features/riders/rider";

export default function Checkout() {
  const router = useRouter();
  const session = useSession();
  const { items, clear, revalidate } = useCart();
  const ridersQ = usePrivate<{ riders: Row[] }>("/riders");
  const [window, setWindow] = useState(() => {
    const item = items.findLast((line) => Number.isFinite(Date.parse(line.pickupAt ?? "")) && Number.isFinite(Date.parse(line.returnAt ?? "")));
    return item?.pickupAt && item.returnAt ? { pickupAt: item.pickupAt, returnAt: item.returnAt } : defaultWindow();
  });
  const [openedAt] = useState(Date.now);
  const [dates, setDates] = useState(false);
  const [acceptPickupCheck, setAcceptPickupCheck] = useState(false);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(true);
  const write = useWrite();
  useEffect(() => {
    let active = true;
    void revalidate().finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [revalidate]);
  const refetchRiders = ridersQ.refetch;
  const signedIn = !!session;
  useFocusEffect(useCallback(() => {
    if (signedIn) void refetchRiders();
  }, [refetchRiders, signedIn]));
  const units = items.flatMap((line) => line.vehicleIds.map((id) => ({ id, line })));
  const riders = ridersQ.data?.riders ?? [];
  const ret = new Date(window.returnAt);
  const pickup = new Date(window.pickupAt);
  const returnDay = Number.isFinite(ret.getTime()) ? istDay(ret) : "";
  const validRange = pickup.getTime() >= openedAt && ret > pickup;
  const assignedRiders = units.map(({ id }) => riders.find((row) => row.id === assign[id]));
  const needsPickupCheck = assignedRiders.some((rider) => rider?.pickup_licence_available === true);
  const assigned = units.length > 0 && new Set(units.map(({ id }) => assign[id])).size === units.length &&
    assignedRiders.every((rider) => canRide(rider, returnDay) || rider?.pickup_licence_available === true);

  const valid = !!session && assigned && !checking && ridersQ.isSuccess && !ridersQ.isFetching && validRange && (!needsPickupCheck || acceptPickupCheck);
  function submit() {
    if (!valid) return;
    void write.run(async () => {
      if (pickup.getTime() < Date.now()) { setDates(true); return; }
      const result = await api<{ groupId: string }>("/bookings", { method: "POST", body: {
        items: units.map(({ id }, index) => ({
          vehicleId: id, riderId: assign[id],
          ...(assignedRiders[index]?.pickup_licence_available === true && acceptPickupCheck ? { pickupLicenceAccepted: true } : {}),
        })), pickupAt: window.pickupAt, returnAt: window.returnAt,
      } });
      if (typeof result?.groupId !== "string" || !result.groupId) throw new ApiError(502, "Couldn't read your booking hold. Check your bookings before trying again.");
      clear();
      router.replace({ pathname: "/checkout/pay/[groupId]", params: { groupId: result.groupId } });
    });
  }
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }}
    footer={session && !!units.length && <Button variant="primary" label="Continue to payment" busy={write.busy} disabled={!valid} onPress={submit} />}>
    <Stack.Screen options={{ title: "Checkout" }} />
    {!session ? <EmptyState title="Sign in to book" action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : checking ? <LoadingRows label="Checking availability" />
      : units.length === 0 ? <EmptyState title="Your cart is empty" action={<Button label="Back to browse" variant="primary" onPress={() => router.replace("/browse")} />} />
      : <>
        <Card title="Rental dates"><View style={{ gap: space[2] }}>
          <Text>{dateTimeLabel(window.pickupAt)} → {dateTimeLabel(window.returnAt)}</Text>
          {!validRange && <ErrorNote text="Choose a future pickup and a return after pickup." />}
          <Button label="Change dates" onPress={() => setDates(true)} />
        </View></Card>
        <Card title="Who’s riding?"><View style={{ gap: space[3] }}>
          {units.length > 1 && <Text size="sm" color="ink2">Choose a different rider for each vehicle.</Text>}
          {ridersQ.isPending ? <LoadingRows label="Loading riders" /> : ridersQ.error
            ? <ErrorNote text={errorMessage(ridersQ.error, "Couldn't load your riders.")} onRetry={() => void ridersQ.refetch()} />
            : units.map(({ id, line }, index) => {
              const current = riders.find((row) => row.id === assign[id]);
              const used = new Set(units.filter((unit) => unit.id !== id).map((unit) => assign[unit.id]));
              const verified = canRide(current, returnDay);
              return <View key={id} style={{ gap: space[2] }}>
                {index > 0 && <Line />}
                <Text weight="bold">{line.make} {line.model}</Text>
                <Text color="ink2" size="sm">{line.shopName}</Text>
                <SelectField label="Rider" value={assign[id] ?? null} placeholder="Choose a rider"
                  options={riders.map((row) => ({ value: String(row.id), label: String(row.name), disabled: used.has(String(row.id)) }))}
                  onChange={(value) => { setAcceptPickupCheck(false); setAssign((prev) => ({ ...prev, [id]: value })); }} />
                {current && (verified ? <Chip tone="good" label={`Verified · valid until ${dateLabel(current.licence_expires_on)}`} />
                  : current.pickup_licence_available === true ? <Chip tone="info" label="Shop checks your licence at pickup" />
                  : current.verification_state === "MANUAL_REVIEW_REQUIRED" ? <Chip tone="attention" label="Licence review pending" />
                  : current.licence_status === "VERIFIED" ? <Text size="sm" color="danger">This licence expires before your return. Choose another rider.</Text>
                  : <Button label="Check driving licence" onPress={() => router.push({ pathname: "/rider/[riderId]/verify", params: { riderId: String(current.id) } })} />)}
              </View>;
            })}
          <Button label="Add a rider" onPress={() => router.push({ pathname: "/rider/[riderId]", params: { riderId: "new" } })} />
        </View></Card>
        {needsPickupCheck && <Card title="Licence check at pickup">
          <Text size="sm">{pickupLicenceTerms}</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push("/policies")}><Text style={{ textDecorationLine: "underline" }}>Cancellation policy</Text></Pressable>
          <Button label={acceptPickupCheck ? "I understand ✓" : "I understand"} accessibilityState={{ selected: acceptPickupCheck }}
            variant={acceptPickupCheck ? "dark" : "secondary"} onPress={() => setAcceptPickupCheck(!acceptPickupCheck)} />
        </Card>}
        {write.error && <ErrorNote text={write.error} />}
      </>}
    <DateRangeSheet monochrome open={dates} value={window} onClose={() => setDates(false)} onChange={setWindow} />
  </Screen>;
}
