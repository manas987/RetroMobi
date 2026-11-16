import { useState } from "react";
import { View } from "react-native";
import Slider from "@react-native-community/slider";
import { Button, Field, Input, Segmented, Sheet, Text, CLEAR_SEARCH_FILTERS, bodyTypeLabel, colors, rupees, space, type SearchCriteria, type SearchResult } from "@retromobi/mobile-shared";
import { LocationButton, type Geo } from "./maps";

type Props = { criteria: SearchCriteria; onChange: (patch: Partial<SearchCriteria>) => void; results: SearchResult[]; histogram: number[]; total: number; geo: Geo; close: () => void };
function toggle<T>(list: T[] = [], value: T) { return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]; }

export function Filters({ criteria: c, onChange, results, histogram, geo, total, close }: Props) {
  const [location, setLocation] = useState(false);
  const makes = [...new Set([...(c.make ?? []), ...results.map(({ model }) => model.make)])].sort();
  const types = [...new Set([...(c.bodyType ?? []), ...results.flatMap(({ model }) => model.bodyType ? [model.bodyType] : [])])].sort();
  const buckets = Array.from({ length: 20 }, () => 0);
  for (const price of histogram) {
    const at = Math.max(0, Math.min(19, Math.floor(price / 25000)));
    buckets[at] = (buckets[at] ?? 0) + 1;
  }
  const max = Math.max(...buckets, 1);
  const options = <T extends string>(values: readonly T[], selected: T[], label: (value: T) => string, press: (value: T) => void) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {values.map((value) => <Button key={value} label={label(value)} variant={selected.includes(value) ? "dark" : "secondary"}
        accessibilityState={{ selected: selected.includes(value) }} onPress={() => press(value)} />)}
    </View>
  );
  return <Sheet open title="Filters" onClose={close} footer={<View style={{ gap: space[2] }}>
    <Button variant="primary" label={`Show ${total} ${total === 1 ? "vehicle" : "vehicles"}`} onPress={close} />
    <Button variant="ghost" label="Clear all" onPress={() => onChange(CLEAR_SEARCH_FILTERS)} />
  </View>}>
    <View style={{ gap: space[4] }}>
      <Text weight="bold" accessibilityRole="header">Sort</Text>
      <Segmented value={c.sort === "distance" && !geo.coords ? "price" : c.sort} options={[{ value: "price", label: "Price" }, { value: "rating", label: "Rating" }, { value: "distance", label: "Distance" }]}
        onChange={(sort) => { if (sort === "distance" && !geo.coords) setLocation(true); else onChange({ sort }); }} />
      {location && !geo.coords && <LocationButton geo={geo} onLocated={() => { onChange({ sort: "distance" }); setLocation(false); }} />}
      {(types.length > 1 || !!c.bodyType?.length) && <>
        <Text weight="bold" accessibilityRole="header">Vehicle type</Text>
        {options(types, c.bodyType ?? [], bodyTypeLabel, (value) => onChange({ bodyType: toggle(c.bodyType, value) }))}
      </>}
      <Text weight="bold" accessibilityRole="header">Fuel type</Text>
      {options(["PETROL", "ELECTRIC"] as const, c.fuelType ?? [], (v) => v === "PETROL" ? "Petrol" : "Electric",
        (value) => onChange({ fuelType: toggle(c.fuelType, value) }))}
      {(makes.length > 1 || !!c.make?.length) && <>
        <Text weight="bold" accessibilityRole="header">Brand</Text>
        {options(makes, c.make ?? [], (v) => v, (value) => onChange({ make: toggle(c.make, value) }))}
      </>}
      <Text weight="bold" accessibilityRole="header">Price per day</Text>
      {histogram.length > 0 && <View accessible={false} style={{ flexDirection: "row", height: 40, gap: 2, alignItems: "flex-end" }}>
        {buckets.map((n, i) => <View key={i} style={{ flex: 1, height: 40 * n / max, backgroundColor: colors.lineStrong }} />)}
      </View>}
      <RangeFields key={`price-${c.minPrice}-${c.maxPrice}`} label="Price per day" min={c.minPrice ? c.minPrice / 100 : undefined} max={c.maxPrice ? c.maxPrice / 100 : undefined}
        until={5000} text={(v) => rupees(v * 100)} onChange={(min, max) => onChange({ minPrice: min ? min * 100 : undefined, maxPrice: max ? max * 100 : undefined })} />
      <Text weight="bold" accessibilityRole="header">Engine power</Text>
      <RangeFields key={`engine-${c.minEngineCc}-${c.maxEngineCc}`} label="Engine power" min={c.minEngineCc} max={c.maxEngineCc} until={1000} text={(v) => `${v} cc`}
        onChange={(minEngineCc, maxEngineCc) => onChange({ minEngineCc, maxEngineCc })} />
      {geo.coords && <Field label={c.maxDistanceKm ? `Within ${c.maxDistanceKm} km` : "Any distance"}>
        <Slider minimumValue={1} maximumValue={50} step={1} minimumTrackTintColor={colors.ink} maximumTrackTintColor={colors.lineStrong}
          accessibilityLabel="Maximum distance" value={c.maxDistanceKm ?? 50} onSlidingComplete={(v) => onChange({ maxDistanceKm: v === 50 ? undefined : v })} />
      </Field>}
      <Text weight="bold" accessibilityRole="header">Rating</Text>
      {options(["Any", "4.5", "4", "3.5"], [c.minRating ? String(c.minRating) : "Any"], (value) => value === "Any" ? "Any" : `${value}★ and up`,
        (value) => onChange({ minRating: value === "Any" ? undefined : Number(value) }))}
    </View>
  </Sheet>;
}

function RangeFields({ label, min, max, until, text, onChange }: {
  label: string; min?: number; max?: number; until: number; text: (value: number) => string;
  onChange: (min?: number, max?: number) => void;
}) {
  const [lo, setLo] = useState(min?.toString() ?? "");
  const [hi, setHi] = useState(max?.toString() ?? "");
  const a = Number(lo || 0);
  const b = Number(hi || until);
  const valid = a >= 0 && b >= a && b <= until;
  return <View style={{ gap: space[2] }}>
    <View style={{ flexDirection: "row", gap: space[2] }}>
      <Input style={{ flex: 1 }} accessibilityLabel={`${label} minimum`} placeholder={text(0)} value={lo} keyboardType="number-pad" onChangeText={(v) => setLo(v.replace(/\D/g, ""))} />
      <Input style={{ flex: 1 }} accessibilityLabel={`${label} maximum`} placeholder={`${text(until)}+`} value={hi} keyboardType="number-pad" onChangeText={(v) => setHi(v.replace(/\D/g, ""))} />
    </View>
    {!valid && <Text size="sm" color="danger">Choose a maximum above the minimum, up to {text(until)}.</Text>}
    <Button label={`Apply ${label.toLowerCase()}`} disabled={!valid} onPress={() => onChange(a || undefined, b === until ? undefined : b)} />
  </View>;
}
