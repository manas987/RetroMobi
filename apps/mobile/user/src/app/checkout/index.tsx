import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CalendarDays, Check, ChevronDown, IdCard, Plus, UserRound } from "lucide-react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import {
  ApiError, Button, DateRangeSheet, ErrorNote, LoadingRows, Screen, Sheet, Text,
  api, colors, dayLabel, defaultWindow, errorMessage, radius, space, timeLabel, useSession, type Row,
} from "@retromobi/mobile-shared";
import { EmptyState, Headline, IconAction, PillCTA, Ticket, Tick } from "../../features/RiderSurface";
import { ProfileAvatar } from "../../features/profile/ProfileSurface";
import { trail, type } from "../../ui/trail";
import { CheckoutVehicle } from "../../features/checkout/CheckoutVehicle";
import { useCart } from "../../state/cart";
import { usePrivate, useWrite } from "../../state/private";
import { licenceDeclarations } from "../../features/riders/rider";

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
  const [choosing, setChoosing] = useState<string | null>(null);
  const [ticks, setTicks] = useState({ validLicence: false, cancelIfMissing: false });
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
  const validRange = pickup.getTime() >= openedAt && ret > pickup;
  const assignedRiders = units.map(({ id }) => riders.find((row) => row.id === assign[id]));
  const assigned = units.length > 0 && assignedRiders.every(Boolean) && new Set(units.map(({ id }) => assign[id])).size === units.length;
  const declared = ticks.validLicence && ticks.cancelIfMissing;
  const valid = !!session && assigned && declared && !checking && ridersQ.isSuccess && !ridersQ.isFetching && validRange;
  function submit() {
    if (!valid) return;
    void write.run(async () => {
      if (pickup.getTime() < Date.now()) { setDates(true); return; }
      const result = await api<{ groupId: string }>("/bookings", { method: "POST", body: {
        items: units.map(({ id }) => ({ vehicleId: id, riderId: assign[id] })), pickupAt: window.pickupAt, returnAt: window.returnAt,
        licenceDeclaration: { validLicence: true, cancelIfMissing: true },
      } });
      if (typeof result?.groupId !== "string" || !result.groupId) throw new ApiError(502, "Couldn't read your booking hold. Check your bookings before trying again.");
      clear();
      router.replace({ pathname: "/checkout/pay/[groupId]", params: { groupId: result.groupId } });
    });
  }
  const remaining = assignedRiders.filter((rider) => !rider).length;
  const footerNote = checking || ridersQ.isPending || ridersQ.isFetching ? "Checking booking details…"
    : !validRange ? "Choose valid rental dates to continue."
    : ridersQ.error ? "Reload your riders to continue."
    : remaining ? (remaining === 1 ? "Choose a rider to continue." : `Choose ${remaining} riders to continue.`)
    : !declared ? "Tick both boxes to continue." : null;
  const occupied = new Set(units.filter((unit) => unit.id !== choosing).map((unit) => assign[unit.id]));

  return <Screen edges={["left", "right", "bottom"]} contentStyle={styles.content}
    footer={session && !!units.length && <View style={styles.footer}>
      {footerNote && <Text size="sm" color="ink2" center>{footerNote}</Text>}
      <PillCTA label="Continue to payment" busy={write.busy} disabled={!valid} onPress={submit} />
    </View>}>
    <Stack.Screen options={{ title: "" }} />
    {!session ? <EmptyState title="Sign in to book" action={<Button label="Sign in" variant="primary" onPress={() => router.push("/login")} />} />
      : checking ? <LoadingRows label="Checking availability" />
      : units.length === 0 ? <EmptyState title="Your cart is empty" action={<Button label="Back to browse" variant="primary" onPress={() => router.replace("/browse")} />} />
      : <>
        <Headline kicker="Almost there" title="Checkout" />
        <Ticket dark label="Rental dates, opens the rental calendar" onPress={() => setDates(true)}
          from={{ label: "Pickup", day: dayLabel(window.pickupAt), time: timeLabel(window.pickupAt) }}
          to={{ label: "Return", day: dayLabel(window.returnAt), time: timeLabel(window.returnAt) }}
          strip={<>
            <CalendarDays color={colors.amber} size={16} />
            <Text size="sm" style={{ color: trail.mist, flex: 1 }}>{units.length} {units.length === 1 ? "vehicle" : "vehicles"}</Text>
            <Text size="sm" weight="bold" color="white">Edit dates</Text>
          </>} />
        {!validRange && <ErrorNote text="Choose a future pickup and a return after pickup." />}

        <View style={styles.headingRow}>
          <View style={styles.grow}>
            <Text weight="bold" accessibilityRole="header" style={type.title}>Who’s riding?</Text>
            {units.length > 1 && <Text size="sm" color="ink2">Choose a different rider for each vehicle.</Text>}
          </View>
          <IconAction icon={Plus} tone="forest" label="Add a rider" onPress={() => router.push({ pathname: "/rider/[riderId]", params: { riderId: "new" } })} />
        </View>

        {ridersQ.isPending ? <LoadingRows label="Loading riders" />
          : ridersQ.error ? <ErrorNote text={errorMessage(ridersQ.error, "Couldn't load your riders.")} onRetry={() => void ridersQ.refetch()} />
          : units.map(({ id, line }, index) => {
            const current = assignedRiders[index];
            return <View key={id} style={styles.vehicle}>
              <CheckoutVehicle make={line.make} model={line.model} shopName={line.shopName} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Rider for ${line.make} ${line.model}`}
                accessibilityValue={{ text: current ? String(current.name) : "Choose a rider" }} accessibilityState={{ expanded: choosing === id }}
                onPress={() => setChoosing(id)} style={({ pressed }) => [styles.rider, pressed && styles.pressed]}>
                {current ? <ProfileAvatar name={String(current.name)} compact /> : <View style={styles.noRider}><UserRound size={19} color={colors.ink2} /></View>}
                <View style={styles.grow}>
                  <Text size="xs" color="ink2" weight="medium">Rider</Text>
                  <Text weight="medium">{current ? String(current.name) : "Choose a rider"}</Text>
                </View>
                <ChevronDown size={17} color={colors.ink2} />
              </Pressable>
            </View>;
          })}

        <View style={styles.declare}>
          <View style={styles.declareHead}>
            <View style={styles.declareIcon}><IdCard size={20} color={trail.forest} /></View>
            <View style={styles.grow}>
              <Text weight="bold" accessibilityRole="header" style={type.title}>Before you book</Text>
              <Text size="sm" color="ink2">The shop checks the original licence when you collect the vehicle.</Text>
            </View>
          </View>
          {(["validLicence", "cancelIfMissing"] as const).map((key) => <Tick key={key} label={licenceDeclarations[key]} checked={ticks[key]}
            onChange={(checked) => setTicks((prev) => ({ ...prev, [key]: checked }))} />)}
          <Pressable accessibilityRole="link" style={styles.action} onPress={() => router.push("/policies")}>
            <Text weight="medium" color="verified" style={{ textDecorationLine: "underline" }}>Read the cancellation policy</Text>
          </Pressable>
        </View>
        {write.error && <ErrorNote text={write.error} />}
      </>}
    {choosing && <Sheet open title="Who’s riding?" onClose={() => setChoosing(null)}
      footer={<PillCTA label="Add a new rider" icon={Plus} onPress={() => {
        setChoosing(null);
        router.push({ pathname: "/rider/[riderId]", params: { riderId: "new" } });
      }} />}>
      {riders.length ? <RiderPicker riders={riders} occupied={occupied} value={assign[choosing] ?? null} onChange={(value) => {
        // The statements cover every rider, so a new rider means confirming again.
        if (assign[choosing] !== value) setTicks({ validLicence: false, cancelIfMissing: false });
        setAssign((prev) => ({ ...prev, [choosing]: value }));
        setChoosing(null);
      }} /> : <View style={styles.sheetEmpty}><Text color="ink2">Add your first rider to continue.</Text></View>}
    </Sheet>}
    <DateRangeSheet monochrome open={dates} value={window} onClose={() => setDates(false)} onChange={setWindow} />
  </Screen>;
}

/** Rider cards as radio options; a rider already on another vehicle is greyed out. */
function RiderPicker({ riders, occupied, value, onChange }: {
  riders: Row[]; occupied: Set<string | undefined>; value: string | null; onChange: (id: string) => void;
}) {
  return <View style={{ gap: space[2], paddingBottom: space[2] }}>
    {riders.map((r) => {
      const id = String(r.id);
      const taken = occupied.has(id);
      const selected = value === id;
      return <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: taken }} disabled={taken}
        accessibilityLabel={taken ? `${String(r.name)}, riding another vehicle` : String(r.name)} onPress={() => onChange(id)}
        style={({ pressed }) => [styles.riderCard, selected && styles.riderOn, taken && { opacity: 0.45 }, pressed && styles.pressed]}>
        <ProfileAvatar name={String(r.name)} compact />
        <View style={styles.grow}>
          <Text weight="bold" numberOfLines={1}>{String(r.name)}</Text>
          {taken && <Text size="sm" color="ink2" numberOfLines={1}>Riding another vehicle</Text>}
        </View>
        <View style={[styles.radio, selected && styles.radioOn]}>{selected && <Check size={15} color={colors.onAmber} strokeWidth={3} />}</View>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  riderCard: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderRadius: 22, backgroundColor: colors.surface2,
    borderWidth: 1.5, borderColor: "transparent" },
  riderOn: { borderColor: trail.forest, backgroundColor: trail.forestSoft },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.amber, borderColor: colors.amber },
  content: { gap: space[4] },
  footer: { gap: space[2] },
  grow: { flex: 1 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  declare: { gap: space[3], padding: space[3], borderRadius: 28, backgroundColor: colors.surface2, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
  declareHead: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[1] },
  declareIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
  vehicle: { gap: space[3], padding: space[3], borderRadius: 28, backgroundColor: colors.surface2, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
  rider: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[3], padding: space[2], paddingRight: space[4], backgroundColor: colors.surface, borderRadius: radius.full, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  noRider: { width: 43, height: 43, borderRadius: 22, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  action: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[2] },
  add: { minHeight: 48, flexDirection: "row", flexShrink: 1, alignItems: "center", gap: space[1], paddingHorizontal: space[2] },
  sheetEmpty: { padding: space[4] },
  pressed: { opacity: 0.74 },
});
