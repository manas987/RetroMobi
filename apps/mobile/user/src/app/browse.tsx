import { useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CalendarDays, ChevronRight, Map, Search, ShoppingBag, SlidersHorizontal } from "lucide-react-native";
import {
  Button, CITIES, DateRangeSheet, ErrorNote, Input, LoadingRows, Screen, Sheet, Text,
  CLEAR_SEARCH_FILTERS, DEFAULT_CITY, activeFilters, bodyTypeLabel, colors, dateTimeLabel, errorMessage, parseSearchParams, radius, rentalWindowFromSearch, space, toSearchParams, type SearchCriteria,
} from "@retromobi/mobile-shared";
import { EmptyState, Headline, IconAction, PhotoPill } from "../features/RiderSurface";
import { trail } from "../ui/trail";
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
  const [citySearch, setCitySearch] = useState<string | null>(null);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(route)) if (typeof value === "string") query.set(key, value);
  if (!rentalWindowFromSearch(query.toString())) { query.delete("pickupAt"); query.delete("returnAt"); }
  const criteria = parseSearchParams(query.toString());
  if (!criteria.city) criteria.city = DEFAULT_CITY;
  const win = { pickupAt: criteria.pickupAt, returnAt: criteria.returnAt };
  const q = useSearch(criteria, geo.coords);
  const results = q.data?.results ?? [];
  const active = activeFilters(criteria);
  // Types seen in this session's results, so the pills stay put while one is selected.
  const [seenTypes, setSeenTypes] = useState<string[]>([]);
  const types = [...new Set([...seenTypes, ...(criteria.bodyType ?? []), ...results.flatMap(({ model }) => model.bodyType ? [model.bodyType] : [])])].sort();
  if (types.length !== seenTypes.length) setSeenTypes(types);
  const matchingCities = CITIES.filter((city) => city.toLowerCase().includes(citySearch?.trim().toLowerCase() ?? ""));

  function update(patch: Partial<SearchCriteria>) {
    const next = new URLSearchParams(toSearchParams({ ...criteria, ...patch, page: patch.page ?? 1 }));
    const params: Record<string, string | undefined> = {};
    for (const key of query.keys()) params[key] = undefined;
    for (const [key, value] of next) params[key] = value;
    router.setParams(params);
  }

  const controls = <View style={{ gap: space[3], paddingBottom: space[1] }}>
    <Headline kicker={q.isSuccess ? `${q.data.total} ${q.data.total === 1 ? "ride" : "rides"} available` : "Finding rides…"} title={criteria.city} />
    <View style={styles.toolbar}>
      <Pressable style={styles.search} accessibilityRole="button" accessibilityLabel={`Search pickup cities, current city ${criteria.city}`} onPress={() => setCitySearch("")}>
        <Search size={19} color={colors.ink2} />
        <Text weight="medium" numberOfLines={1} style={{ flex: 1 }}>{criteria.city}, Uttarakhand</Text>
      </Pressable>
      <View>
        <IconAction icon={SlidersHorizontal} tone="soft" label={active.length ? `Filters, ${active.length} active` : "Filters"} onPress={() => setFilters(true)} />
        {!!active.length && <View pointerEvents="none" style={styles.dot} />}
      </View>
      {hasMap && <IconAction icon={Map} tone={view === "map" ? "forest" : "soft"} label={view === "map" ? "Show list" : "Show map"}
        onPress={() => setView(view === "map" ? "list" : "map")} />}
    </View>
    <Pressable style={styles.date} accessibilityRole="button" accessibilityLabel="Change dates" onPress={() => setDates(true)}>
      <View style={styles.dateIcon}><CalendarDays size={16} color={trail.forest} /></View>
      <Text size="sm" weight="medium" style={{ flex: 1 }}>{dateTimeLabel(win.pickupAt)} → {dateTimeLabel(win.returnAt)}</Text>
      <ChevronRight size={16} color={colors.ink2} />
    </Pressable>
    {types.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -space[4] }}
      contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }}>
      <PhotoPill label="All rides" selected={!criteria.bodyType?.length} onPress={() => update({ bodyType: undefined })} />
      {types.map((t) => <PhotoPill key={t} label={bodyTypeLabel(t)} selected={criteria.bodyType?.length === 1 && criteria.bodyType[0] === t}
        onPress={() => update({ bodyType: [t] })} />)}
    </ScrollView>}
  </View>;
  return <Screen scroll={false} padded={false} edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "", headerRight: () =>
      <IconAction icon={ShoppingBag} tone="soft" badge={cart.totalUnits} label={`Cart, ${cart.totalUnits} vehicles`} onPress={() => router.push("/cart")} /> }} />
    {view === "map" && hasMap ? <>
      <View style={{ paddingHorizontal: space[4], paddingTop: space[3] }}>{controls}</View>
      {q.error && <ErrorNote text={errorMessage(q.error, "We couldn't load vehicles.")} onRetry={() => void q.refetch()} />}
      <ResultMap results={results} window={win} geo={geo} />
    </> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={q.isError ? [] : results} keyExtractor={(r) => `${r.model.id}:${r.primaryOffer.shopId}`}
        contentContainerStyle={{ flexGrow: 1, padding: space[4], paddingTop: space[1], gap: space[4] }} keyboardShouldPersistTaps="handled"
        refreshing={q.isRefetching} onRefresh={() => void q.refetch()} ListHeaderComponent={controls}
        ListEmptyComponent={q.isPending ? <LoadingRows rows={4} label="Loading vehicles" />
          : q.isError ? <ErrorNote text={errorMessage(q.error, "We couldn't load vehicles.")} onRetry={() => void q.refetch()} />
          : <EmptyState title="No vehicles match this search" text="Try different rental dates or remove filters to see more options."
            action={<View style={{ gap: space[2] }}><Button label="Change dates" onPress={() => setDates(true)} />
              {active.length > 0 && <Button label="Clear filters" variant="ghost" onPress={() => update(CLEAR_SEARCH_FILTERS)} />}
            </View>} />}
        renderItem={({ item }) => <VehicleCard result={item} window={win} />} />}
    <DateRangeSheet monochrome open={dates} value={win} onClose={() => setDates(false)} onChange={update} />
    {citySearch !== null && <Sheet open title="Pickup city" onClose={() => setCitySearch(null)}>
      <Input accessibilityLabel="Search pickup cities" placeholder="Search pickup cities" value={citySearch} onChangeText={setCitySearch} />
      {matchingCities.map((city) =>
        <Pressable key={city} style={styles.date} accessibilityRole="radio" accessibilityState={{ checked: city === criteria.city }}
          onPress={() => { update({ city }); setCitySearch(null); }}>
          <Text weight={city === criteria.city ? "bold" : "regular"} style={{ flex: 1 }}>{city}, Uttarakhand</Text>
          <ChevronRight size={16} color={colors.ink2} />
        </Pressable>)}
      {!matchingCities.length && <Text color="ink2">No matching cities</Text>}
    </Sheet>}
    {filters && <Filters criteria={criteria} onChange={update} total={q.data?.total ?? 0} results={results}
      histogram={q.data?.priceHistogram ?? []} geo={geo} close={() => setFilters(false)} />}
  </Screen>;
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", alignItems: "center", gap: space[2] },
  search: { flex: 1, flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 52, paddingHorizontal: space[4], backgroundColor: colors.surface3, borderRadius: radius.full },
  dot: { position: "absolute", top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.amber, borderWidth: 2, borderColor: colors.surface3 },
  date: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48 },
  dateIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: trail.forestSoft, alignItems: "center", justifyContent: "center" },
});
