import { useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  CITIES, EmptyState, ErrorNote, LoadingRows, Logo, Screen, Text,
  api, colors, defaultWindow, errorMessage, radius, rupees, space, toSearchParams, type SearchResult,
} from "@retromobi/mobile-shared";

/**
 * SCAFFOLD SCREEN. It proves the whole chain on a device: fonts, theme,
 * the API client and a real public search. Phase U1 of
 * docs/mobile-apps-handoff.md replaces it with the real Explore tab.
 */
export default function Explore() {
  const [city, setCity] = useState(CITIES[0]!);
  // One window per mount: a new one every render would change the query key every render.
  const [win] = useState(defaultWindow);

  const search = useQuery({
    queryKey: ["search", city, win],
    queryFn: ({ signal }) =>
      api<{ results: SearchResult[]; total: number }>(`/search?${toSearchParams({ city, ...win, sort: "price", page: 1 })}`, { auth: false, signal }),
  });

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.header}>
        <Logo />
        <Text size="lg" weight="bold">retromobi</Text>
      </View>

      <View style={styles.cities} accessibilityRole="tablist">
        {CITIES.map((c) => {
          const on = c === city;
          return (
            <Pressable key={c} onPress={() => setCity(c)} style={[styles.city, on && styles.cityOn]}
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={c}>
              <Text size="sm" weight="medium" color={on ? "surface" : "ink"}>{c}</Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={search.data?.results ?? []}
        keyExtractor={(r) => `${r.model.id}:${r.primaryOffer.shopId}`}
        contentContainerStyle={styles.list}
        refreshing={search.isRefetching}
        onRefresh={() => void search.refetch()}
        ListHeaderComponent={
          search.data ? <Text size="lg" weight="bold" style={styles.count}>{search.data.total} {search.data.total === 1 ? "vehicle" : "vehicles"}</Text> : undefined
        }
        ListEmptyComponent={
          search.isPending ? <LoadingRows rows={4} height={72} label="Loading vehicles" />
          : search.isError ? <ErrorNote text={errorMessage(search.error, "We couldn't load vehicles.")} onRetry={() => void search.refetch()} />
          : <EmptyState title="No vehicles match this search" text="Try another city." />
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text weight="bold" numberOfLines={1}>{item.model.make} {item.model.model}</Text>
              <Text size="sm" color="ink3" numberOfLines={1}>{item.primaryOffer.shopName}</Text>
              <Text size="sm" color="ink3">{item.offerVehicleIds.length} available · {rupees(item.primaryOffer.securityDeposit)} deposit</Text>
            </View>
            <Text weight="bold" tnum>{rupees(item.primaryOffer.pricePerDay)}<Text size="sm" color="ink3"> / day</Text></Text>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
  cities: { flexDirection: "row", gap: space[2], paddingHorizontal: space[4], paddingBottom: space[3] },
  city: { minHeight: 44, justifyContent: "center", paddingHorizontal: space[4], borderRadius: radius.full, borderWidth: 1, borderColor: colors.lineStrong },
  cityOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  list: { paddingHorizontal: space[4], paddingBottom: space[8], gap: space[3] },
  count: { marginBottom: space[1] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], borderRadius: radius.panel, borderWidth: 1, borderColor: colors.line },
});
