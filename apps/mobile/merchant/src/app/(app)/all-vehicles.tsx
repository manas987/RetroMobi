import { useState } from "react";
import { ChevronRight } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQueries } from "@tanstack/react-query";
import {
  Card, ConfirmSheet, EmptyState, ErrorNote, LoadingRows, Screen, SelectField, Text,
  api, bookingStage, can, colors, decodeJwtSubject, errorText, rupees, space, useSession, useT, useToast, type Row,
} from "@retromobi/mobile-shared";
import { SearchField, StatusBadge, counter, counterStyles } from "../../ui/Counter";
import { VehicleThumb } from "../../features/fleet/VehicleThumb";
import { AvailChip, STAGE_TONE, type SetupData } from "../../features/fleet/listing";
import { Fields } from "../../features/fleet/tabs/Fields";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite, vehicleLabel } from "../../features/bookings/common";

type Branch = { id: string; name: string; owner: string; write: boolean };
type Move = { vehicle: Row; from: Branch; to: Branch };

export default function AllVehicles() {
  const { t, lang } = useT();
  const toast = useToast();
  const router = useRouter();
  const { shops, setShopId } = useMerchantShop();
  const session = useSession();
  const subject = session ? decodeJwtSubject(session.accessToken) : null;
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("");
  const [move, setMove] = useState<Move | null>(null);
  const write = useCounterWrite();
  const branches: Branch[] = shops.filter((shop) => can(String(shop.role), "fleet:read")).map((s) => ({
    id: String(s.id), name: String(s.name), owner: String(s.merchant_user_id ?? ""), write: can(String(s.role), "fleet:write"),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const options = <T,>(path: string) => ({
    queryKey: ["merchant", path, subject], queryFn: ({ signal }: { signal: AbortSignal }) => api<T>(path, { signal }),
    enabled: !!session && branches.length > 1,
  });
  const vehicles = useQueries({ queries: branches.map(({ id }) => options<{ vehicles: Row[] }>(`/shops/${id}/vehicles`)) });
  const bookings = useQueries({ queries: branches.map(({ id }) => options<{ bookings: Row[] }>(`/shops/${id}/bookings?status=CONFIRMED`)) });
  const setups = useQueries({ queries: branches.map(({ id }) => options<SetupData>(`/shops/${id}/setup`)) });
  const queries = [...vehicles, ...bookings, ...setups];
  const fetching = queries.some((q) => q.isRefetching);
  const pending = queries.some((q) => q.isPending);
  const errors = queries.filter((q) => q.error != null);
  const reload = () => { void Promise.all(queries.map((q) => q.refetch())); };
  const items = branches.flatMap((b, i) => {
    const staged = (bookings[i]?.data?.bookings ?? []).map((booking) => ({ b: booking, stage: bookingStage(booking) }));
    const data = setups[i]?.data?.vehicles;
    return (vehicles[i]?.data?.vehicles ?? []).map((vehicle) => ({
      vehicle, branch: b, staged, hasStatus: bookings[i]?.isSuccess === true, stage: data?.find((item) => item.id === vehicle.id)?.stage,
    }));
  });
  const needle = search.trim().toLowerCase();
  const match = items.filter((item) => (!branch || item.branch.id === branch) && (!needle || vehicleLabel(item.vehicle).toLowerCase().includes(needle)
    || String(item.vehicle.registration_number).replace(/\s/g, "").toLowerCase().includes(needle.replace(/\s/g, ""))));

  return <Screen scroll={false} padded={false} background="canvas" edges={["bottom", "left", "right"]}>
    <Stack.Screen options={{ title: t("nav.allVehicles") }} />
    {branches.length < 2 ? <EmptyState text={t("shop.noBranches")} /> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={match} keyExtractor={({ vehicle }) => String(vehicle.id)}
      contentContainerStyle={{ gap: space[3], padding: space[4] }} onRefresh={reload} refreshing={fetching} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<Fields>
        <Text color="ink2">{t("shop.allVehiclesSubtitle")}</Text>
        <SearchField accessibilityLabel={t("shop.vehSearch")} placeholder={t("shop.vehSearch")} value={search} onChangeText={setSearch} returnKeyType="search" />
        <SelectField compact label={t("shop.colBranch")} value={branch} onChange={setBranch} closeLabel={t("common.close")}
          options={[{ value: "", label: t("shop.vehAllBranches") }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        <Text size="sm" color="ink2">{t("shop.vehCount", { n: items.length, m: branches.length })}</Text>
        {errors.length > 0 && <ErrorNote text={errorText(lang, errors[0]?.error)} retryLabel={t("common.retry")} onRetry={reload} />}
      </Fields>}
      ListEmptyComponent={pending ? <LoadingRows label={t("common.loading")} /> : errors.length ? <></>
        : <EmptyState text={t(items.length ? "shop.vehNoMatch" : "shop.vehEmpty")} />}
      renderItem={({ item }) => {
        const { vehicle: v, branch: source, staged, stage, hasStatus } = item;
        const targets = source.write && source.owner ? branches.filter((b) => b.id !== source.id && b.write && b.owner === source.owner) : [];
        const booked = staged.some((s) => s.b.vehicle_id === v.id);
        return <Card style={counterStyles.panel}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${vehicleLabel(v)} · ${source.name}`} style={({ pressed }) => [counterStyles.row, pressed && { opacity: 0.7 }]}
            onPress={() => { setShopId(source.id); router.push({ pathname: "/vehicle/[id]", params: { id: String(v.id) } }); }}>
            <VehicleThumb vehicleId={String(v.id)} vehicle={v} size={64} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text weight="bold" style={{ color: counter.navy }}>{[v.make, v.model].filter(Boolean).join(" ")}</Text>
              <Text size="sm" color="ink2">{String(v.registration_number ?? "")} · {source.name}</Text>
            </View>
            <ChevronRight size={18} color={colors.ink2} />
          </Pressable>
          <Fields>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
            {stage && <StatusBadge label={t(`fleet.stage_${stage}`)} tone={STAGE_TONE[stage]} />}
            {hasStatus && <AvailChip vehicle={v} staged={staged} />}
            </View>
            {v.amount == null ? <Text size="sm" color="danger">{t("fleet.noPrice")}</Text>
              : <Text weight="bold" size="lg" tnum style={{ color: counter.navy }}>{t("common.perDay", { amount: rupees(Number(v.amount)) })}</Text>}
            {!!targets.length && hasStatus && (booked ? <><StatusBadge label={t("shop.hasBooking")} tone="muted" /><Text size="xs" color="ink2">{t("shop.hasBookingWhy")}</Text></>
              : <SelectField compact label={t("shop.moveTo")} value={null} placeholder={t("shop.colBranch")}
                closeLabel={t("common.close")} options={targets.map((b) => ({ value: b.id, label: b.name }))}
                onChange={(id) => { const to = targets.find((b) => b.id === id); if (to) setMove({ vehicle: v, from: source, to }); }} />)}
          </Fields>
        </Card>;
      }} />}
    <ConfirmSheet open={!!move} title={t("shop.moveTitle", { vehicle: move ? vehicleLabel(move.vehicle) : "", shop: move?.to.name ?? "" })}
      body={move ? <Fields>
        <Text>{t("shop.movePickup", { shop: move.to.name })}</Text><Text>{t("shop.moveCarries")}</Text>
        <Text>{t("shop.moveHistory", { shop: move.to.name })}</Text><Text>{t("shop.moveStaff", { from: move.from.name })}</Text>
      </Fields> : null}
      cancelLabel={t("common.cancel")} confirmLabel={t("shop.moveConfirm")} busy={write.busy} error={write.error}
      onClose={() => setMove(null)} onConfirm={() => {
        if (move) void write.run(async () => {
          await api(`/vehicles/${move.vehicle.id}/move`, { method: "POST", body: { toShopId: move.to.id } });
          toast(t("shop.moved", { vehicle: vehicleLabel(move.vehicle), shop: move.to.name }));
          setMove(null);
        });
      }} />
  </Screen>;
}
