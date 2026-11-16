import { useState } from "react";
import { FlatList, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  Button, CITIES, DateRangeSheet, ErrorNote, LoadingRows, Screen, Segmented, SelectField, Text,
  CLEAR_SEARCH_FILTERS, DEFAULT_CITY, activeFilters, dateTimeLabel, errorMessage, parseSearchParams, rentalWindowFromSearch, space, toSearchParams, type SearchCriteria,
} from "@retromobi/mobile-shared";
import { EmptyState } from "../features/RiderSurface";
import { useCart } from "../state/cart";
import { useSearch } from "../features/explore/api";
import { Filters } from "../features/explore/Filters";
import { hasMap, ResultMap, useLocation } from "../features/explore/maps";
import { VehicleCard } from "../features/explore/VehicleCard";

export default function Browse() {
  const route = useLocalSearchParams();
  const router = useRouter();
  const cart = useCart();
  const geo = useLocation();
  const [view, setView] = useState<"list" | "map">("list");
  const [dates, setDates] = useState(false);
  const [filters, setFilters] = useState(false);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(route)) if (typeof value === "string") query.set(key, value);
  if (!rentalWindowFromSearch(query.toString())) { query.delete("pickupAt"); query.delete("returnAt"); }
  const criteria = parseSearchParams(query.toString());
  if (!criteria.city) criteria.city = DEFAULT_CITY;
  const win = { pickupAt: criteria.pickupAt, returnAt: criteria.returnAt };
  const q = useSearch(criteria, geo.coords);
  const results = q.data?.results ?? [];
  const active = activeFilters(criteria);

  function update(patch: Partial<SearchCriteria>) {
    const next = new URLSearchParams(toSearchParams({ ...criteria, ...patch, page: patch.page ?? 1 }));
    const params: Record<string, string | undefined> = {};
    for (const key of query.keys()) params[key] = undefined;
    for (const [key, value] of next) params[key] = value;
    router.setParams(params);
  }

  const controls = <View style={{ gap: space[2] }}>
    <SelectField label="Pickup city" value={criteria.city} onChange={(city) => update({ city })} options={CITIES.map((value) => ({ value, label: `${value}, Uttarakhand` }))} />
    <Button label={`${dateTimeLabel(win.pickupAt)} → ${dateTimeLabel(win.returnAt)}`} accessibilityLabel="Change dates" onPress={() => setDates(true)} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      <Button label={active.length ? `Filters · ${active.length}` : "Filters"} onPress={() => setFilters(true)} />
      <Button label={`Cart · ${cart.totalUnits}`} variant={cart.totalUnits ? "dark" : "ghost"} onPress={() => router.push("/cart")} />
    </View>
    {hasMap && <Segmented value={view} onChange={setView} options={[{ value: "list", label: "List" }, { value: "map", label: "Map" }]} />}
    {q.isSuccess && <Text size="lg" weight="bold" accessibilityRole="header">{q.data.total} {q.data.total === 1 ? "vehicle" : "vehicles"}</Text>}
  </View>;
  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "Browse vehicles" }} />
    {view === "map" && hasMap ? <>
      <View style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>{controls}</View>
      {q.error && <ErrorNote text={errorMessage(q.error, "We couldn't load vehicles.")} onRetry={() => void q.refetch()} />}
      <ResultMap results={results} window={win} geo={geo} />
    </> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={q.isError ? [] : results} keyExtractor={(r) => `${r.model.id}:${r.primaryOffer.shopId}`}
        contentContainerStyle={{ flexGrow: 1, padding: space[4], gap: space[3] }} keyboardShouldPersistTaps="handled"
        refreshing={q.isRefetching} onRefresh={() => void q.refetch()} ListHeaderComponent={controls}
        ListEmptyComponent={q.isPending ? <LoadingRows rows={4} label="Loading vehicles" />
          : q.isError ? <ErrorNote text={errorMessage(q.error, "We couldn't load vehicles.")} onRetry={() => void q.refetch()} />
          : <EmptyState title="No vehicles match this search" text="Try different rental dates or remove filters to see more options."
            action={<View style={{ gap: space[2] }}><Button label="Change dates" onPress={() => setDates(true)} />
              {active.length > 0 && <Button label="Clear filters" variant="ghost" onPress={() => update(CLEAR_SEARCH_FILTERS)} />}
            </View>} />}
        renderItem={({ item }) => <VehicleCard result={item} window={win} />} />}
    <DateRangeSheet monochrome open={dates} value={win} onClose={() => setDates(false)} onChange={update} />
    {filters && <Filters criteria={criteria} onChange={update} total={q.data?.total ?? 0} results={results}
      histogram={q.data?.priceHistogram ?? []} geo={geo} close={() => setFilters(false)} />}
  </Screen>;
}
