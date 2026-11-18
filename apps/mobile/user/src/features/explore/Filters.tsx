import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Button, Field, Line, Sheet, Text, CLEAR_SEARCH_FILTERS, bodyTypeLabel, colors, radius, rupees, space, type SearchCriteria, type SearchResult } from "@retromobi/mobile-shared";
import { LocationButton, type Geo } from "./maps";
import { PillCTA } from "../RiderSurface";
import { trail } from "../../ui/trail";

type Props = { criteria: SearchCriteria; onChange: (patch: Partial<SearchCriteria>) => void; results: SearchResult[]; histogram: number[]; total: number; geo: Geo; close: () => void };
function toggle<T>(list: T[] = [], value: T) { return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]; }

export function Filters({ criteria: c, onChange, results, histogram, geo, total, close }: Props) {
  const [location, setLocation] = useState(false);
  const makes = [...new Set([...(c.make ?? []), ...results.map(({ model }) => model.make)])].sort();
  const types = [...new Set([...(c.bodyType ?? []), ...results.flatMap(({ model }) => model.bodyType ? [model.bodyType] : [])])].sort();
  const options = <T extends string>(values: readonly T[], selected: T[], label: (value: T) => string, press: (value: T) => void) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {values.map((value) => {
        const active = selected.includes(value);
        return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: active }}
          style={[styles.pill, active && styles.selected]} onPress={() => press(value)}>
          <Text weight="medium" color={active ? "surface" : "ink"}>{label(value)}</Text>
        </Pressable>;
      })}
    </View>
  );
  return <Sheet open title="Filters" onClose={close} footer={<View style={styles.footer}>
    <Button variant="ghost" label="Clear all" onPress={() => onChange(CLEAR_SEARCH_FILTERS)} />
    <View style={{ flex: 1 }}><PillCTA label={`Show ${total} ${total === 1 ? "ride" : "rides"}`} onPress={close} /></View>
  </View>}>
    <View style={{ gap: space[4] }}>
      <Text size="lg" weight="bold" accessibilityRole="header">Sort</Text>
      {options(["price", "rating", "distance"] as const, [c.sort === "distance" && !geo.coords ? "price" : c.sort],
        (sort) => ({ price: "Price", rating: "Rating", distance: "Distance" })[sort],
        (sort) => { if (sort === "distance" && !geo.coords) setLocation(true); else onChange({ sort }); })}
      {location && !geo.coords && <LocationButton geo={geo} onLocated={() => { onChange({ sort: "distance" }); setLocation(false); }} />}
      <Line />
      {(types.length > 1 || !!c.bodyType?.length) && <>
        <Text size="lg" weight="bold" accessibilityRole="header">Vehicle type</Text>
        {options(types, c.bodyType ?? [], bodyTypeLabel, (value) => onChange({ bodyType: toggle(c.bodyType, value) }))}
      </>}
      <Text size="lg" weight="bold" accessibilityRole="header">Fuel type</Text>
      {options(["PETROL", "ELECTRIC"] as const, c.fuelType ?? [], (v) => v === "PETROL" ? "Petrol" : "Electric",
        (value) => onChange({ fuelType: toggle(c.fuelType, value) }))}
      {(makes.length > 1 || !!c.make?.length) && <>
        <Text size="lg" weight="bold" accessibilityRole="header">Brand</Text>
        {options(makes, c.make ?? [], (v) => v, (value) => onChange({ make: toggle(c.make, value) }))}
      </>}
      <Line />
      <Text size="lg" weight="bold" accessibilityRole="header">Price per day</Text>
      <RangeSlider key={`price-${c.minPrice}-${c.maxPrice}`} label="Price per day"
        min={c.minPrice == null ? undefined : c.minPrice / 100} max={c.maxPrice == null ? undefined : c.maxPrice / 100}
        until={5000} step={50} histogram={histogram} text={(v) => rupees(v * 100)}
        onChange={(min, max) => onChange({ minPrice: min == null ? undefined : min * 100, maxPrice: max == null ? undefined : max * 100 })} />
      <Text size="lg" weight="bold" accessibilityRole="header">Engine power</Text>
      <RangeSlider key={`engine-${c.minEngineCc}-${c.maxEngineCc}`} label="Engine power" min={c.minEngineCc} max={c.maxEngineCc} until={1000} step={10} text={(v) => `${v} cc`}
        onChange={(minEngineCc, maxEngineCc) => onChange({ minEngineCc, maxEngineCc })} />
      {geo.coords && <Field label={c.maxDistanceKm ? `Within ${c.maxDistanceKm} km` : "Any distance"}>
        <Slider minimumValue={1} maximumValue={50} step={1} minimumTrackTintColor={trail.forest} maximumTrackTintColor={colors.lineStrong}
          accessibilityLabel="Maximum distance" value={c.maxDistanceKm ?? 50} onSlidingComplete={(v) => onChange({ maxDistanceKm: v === 50 ? undefined : v })} />
      </Field>}
      <Text size="lg" weight="bold" accessibilityRole="header">Rating</Text>
      {options(["Any", "4.5", "4", "3.5"], [c.minRating ? String(c.minRating) : "Any"], (value) => value === "Any" ? "Any" : `${value}★ and up`,
        (value) => onChange({ minRating: value === "Any" ? undefined : Number(value) }))}
    </View>
  </Sheet>;
}

function RangeSlider({ label, min, max, until, step, histogram, text, onChange }: {
  label: string; min?: number; max?: number; until: number; step: number; text: (value: number) => string;
  histogram?: number[];
  onChange: (min?: number, max?: number) => void;
}) {
  const end = Math.max(until, (Math.floor(Math.max(min ?? 0, max ?? 0) / step) + 1) * step);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<[number, number]>([min ?? 0, max ?? end]);
  const drag = useRef<0 | 1>(0);
  const track = Math.max(0, width - 28);
  const left = range[0] / end * track;
  const right = range[1] / end * track;
  const buckets = Array<number>(20).fill(0);
  for (const price of histogram ?? []) {
    const index = Math.max(0, Math.min(buckets.length - 1, Math.floor(price / 100 / end * buckets.length)));
    buckets[index]! += 1;
  }
  const peak = Math.max(...buckets, 1);
  const valueAt = (x: number) => Math.min(end, Math.max(0, Math.round((x - 14) / track * end / step) * step));
  function nextRange(thumb: 0 | 1, value: number): [number, number] {
    return thumb === 0 ? [Math.max(0, Math.min(range[1], value)), range[1]]
      : [range[0], Math.min(end, Math.max(range[0], value))];
  }
  function commit(next: [number, number]) {
    setRange(next);
    onChange(next[0] || undefined, next[1] === end ? undefined : next[1]);
  }

  return <View style={!!histogram?.length && styles.withHistogram}>
    <View style={styles.slider} onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      onStartShouldSetResponder={() => track > 0} onResponderTerminationRequest={() => false}
      onResponderGrant={({ nativeEvent }) => {
        const x = nativeEvent.locationX - 14;
        drag.current = left === right ? (x < left || left === track ? 0 : 1) : Math.abs(x - left) < Math.abs(x - right) ? 0 : 1;
        setRange(nextRange(drag.current, valueAt(nativeEvent.locationX)));
      }}
      onResponderMove={({ nativeEvent }) => setRange(nextRange(drag.current, valueAt(nativeEvent.locationX)))}
      onResponderRelease={({ nativeEvent }) => commit(nextRange(drag.current, valueAt(nativeEvent.locationX)))}
      onResponderTerminate={() => setRange([min ?? 0, max ?? end])}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {!!histogram?.length && <View style={styles.histogram}>
          {buckets.map((count, index) => {
            const start = index / buckets.length * end;
            const finish = (index + 1) / buckets.length * end;
            const selected = start <= range[1] && finish > range[0];
            return <View key={index} style={[styles.bar, { height: 40 * count / peak, backgroundColor: selected ? trail.forest : colors.line }]} />;
          })}
        </View>}
        <View style={styles.track} />
        <View style={[styles.track, styles.selection, { left: 14 + left, right: undefined, width: right - left }]} />
        <View style={[styles.thumb, { left }]} />
        <View style={[styles.thumb, { left: right }]} />
      </View>
    </View>
    <View style={styles.rangeLabels}>
      {range.map((value, index) => <View key={index} accessible accessibilityRole="adjustable"
        accessibilityLabel={`${label} ${index === 0 ? "minimum" : "maximum"}`}
        accessibilityValue={{ text: index === 1 && value === end ? `${text(value)} and up` : text(value) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => commit(nextRange(index === 0 ? 0 : 1, value + (nativeEvent.actionName === "increment" ? step : -step)))}>
        <Text size="xs" color="ink2">{index === 0 ? "Minimum" : "Maximum"}</Text>
        <Text weight="bold">{text(value)}{index === 1 && value === end ? "+" : ""}</Text>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  pill: { minHeight: 48, justifyContent: "center", backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: space[4], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  selected: { backgroundColor: trail.forest, borderColor: trail.forest },
  footer: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  rangeLabels: { flexDirection: "row", justifyContent: "space-between", gap: space[3] },
  slider: { height: 48 },
  withHistogram: { paddingTop: 20 },
  histogram: { position: "absolute", left: 14, right: 14, top: -19, height: 40, flexDirection: "row", gap: 2, alignItems: "flex-end" },
  bar: { flex: 1, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  track: { position: "absolute", left: 14, right: 14, top: 21, height: 6, borderRadius: 3, backgroundColor: colors.line },
  selection: { backgroundColor: trail.forest },
  thumb: { position: "absolute", top: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.amber, borderWidth: 3, borderColor: colors.white,
    shadowColor: colors.ink, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
});
