import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import Mapbox, { Camera, MapView, PointAnnotation } from "@rnmapbox/maps";
import { Accuracy, getCurrentPositionAsync, getForegroundPermissionsAsync, requestForegroundPermissionsAsync } from "expo-location";
import { Button, ErrorNote, Text, colors, mapShops, radius, rupees, space, type DateWindow, type SearchResult } from "@retromobi/mobile-shared";
import { Card } from "../RiderSurface";
import { useRouter } from "expo-router";
import type { Coords } from "./api";

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
export const hasMap = !!token?.startsWith("pk.");

export function useLocation() {
  const [state, setState] = useState<"idle" | "asking" | "granted" | "denied" | "error">("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    if (state !== "granted" && state !== "denied") return;
    let active = true;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void getForegroundPermissionsAsync().then((permission) => {
        if (active && !permission.granted) {
          setCoords(null); setState("denied"); setSettings(!permission.canAskAgain);
        }
        if (active && permission.granted && state === "denied") { setState("idle"); setSettings(false); }
      }).catch(() => {});
    });
    return () => { active = false; sub.remove(); };
  }, [state]);
  const request = async () => {
    if (state === "asking") return null;
    setState("asking"); setSettings(false);
    try {
      const permission = await requestForegroundPermissionsAsync();
      if (!permission.granted) { setState("denied"); setSettings(!permission.canAskAgain); setCoords(null); return null; }
      const { coords } = await getCurrentPositionAsync({ accuracy: Accuracy.Balanced });
      const value = { lat: coords.latitude, lng: coords.longitude };
      setCoords(value); setState("granted"); return value;
    } catch { setState("error"); setCoords(null); return null; }
  };
  return { state, coords, settings, request };
}
export type Geo = ReturnType<typeof useLocation>;

export function LocationButton({ geo, onLocated }: { geo: Geo; onLocated?: () => void }) {
  return <View style={{ gap: space[2] }}>
    <Button label="Near me" busy={geo.state === "asking"} onPress={() => { void geo.request().then((value) => { if (value) onLocated?.(); }); }} />
    {geo.state === "denied" && <Text size="sm" color="ink2">Allow location access to see nearby vehicles, or choose a city.</Text>}
    {geo.state === "error" && <ErrorNote text="Couldn't get your location. Try again or choose a city." />}
    {geo.settings && <Button label="Open settings" onPress={() => void Linking.openSettings().catch(() => {})} />}
  </View>;
}

function useMapReady() {
  const [state, setState] = useState<"loading" | "ready" | "error">(hasMap ? "loading" : "error");
  useEffect(() => {
    let active = true;
    if (hasMap) void Mapbox.setAccessToken(token!).then(() => { if (active) setState("ready"); })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  return state;
}

export function ResultMap({ results, window, geo }: { results: SearchResult[]; window: DateWindow; geo: Geo }) {
  const router = useRouter();
  const state = useMapReady();
  const [map, setMap] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const shops = mapShops(results);
  const item = shops.find((shop) => shop.shopId === selected);
  const first = shops[0];
  const center = geo.coords ? [geo.coords.lng, geo.coords.lat] : first ? [first.longitude, first.latitude] : [78.4, 30.1];
  return <View style={{ flex: 1, gap: space[2], padding: space[3] }}>
    <View style={{ flex: 1, minHeight: 175, backgroundColor: colors.surface2, borderRadius: radius.panel, overflow: "hidden" }}>
    {state === "ready" && map !== "error" && <MapView style={StyleSheet.absoluteFill} styleURL={Mapbox.StyleURL.Street} rotateEnabled={false}
      onDidFinishLoadingMap={() => setMap("ready")}
      onMapLoadingError={(event) => { if (!event?.type || event.type === "style") setMap("error"); }}>
      <Camera centerCoordinate={center} zoomLevel={geo.coords ? 12 : 11} animationDuration={300} />
      {shops.map((shop) => <PointAnnotation key={shop.shopId} id={shop.shopId} coordinate={[shop.longitude, shop.latitude]} onSelected={() => setSelected(shop.shopId)}>
        <View accessible accessibilityRole="button" accessibilityLabel={`${shop.name}, starting at ${rupees(shop.pricePerDay)} per day`}
          style={{ borderRadius: radius.full, backgroundColor: selected === shop.shopId ? colors.amber : colors.white, padding: space[2] }}>
          <Text size="sm" weight="bold">{rupees(shop.pricePerDay)}</Text>
        </View>
      </PointAnnotation>)}
    </MapView>}
    {(state !== "ready" || map !== "ready") && <View style={styles.mapMessage}>
      <Text color="ink2" center>{state === "error" || map === "error" ? "The map couldn’t load. Switch to List to see vehicles." : "Loading map…"}</Text>
    </View>}
    </View>
    <LocationButton geo={geo} />
    {item && <Card title={item.name}>
      <Text size="sm" color="ink2">From {rupees(item.pricePerDay)} / day</Text>
      <Button label="View shop" variant="primary" onPress={() => router.push({ pathname: "/shop/[shopId]", params: { shopId: item.shopId, ...window } })} />
    </Card>}
  </View>;
}

export function ShopMap({ lat, lng, name }: { lat: number | null; lng: number | null; name: string }) {
  const state = useMapReady();
  const [failed, setFailed] = useState(false);
  if (state !== "ready" || failed || lat == null || lng == null) return null;
  return <MapView style={{ height: 185 }} styleURL={Mapbox.StyleURL.Street} rotateEnabled={false} scrollEnabled={false}
    onMapLoadingError={(event) => { if (!event?.type || event.type === "style") setFailed(true); }}>
    <Camera defaultSettings={{ centerCoordinate: [lng, lat], zoomLevel: 14 }} />
    <PointAnnotation id="shop" coordinate={[lng, lat]}>
      <View style={{ borderRadius: radius.full, backgroundColor: colors.amber, padding: space[2] }}><Text size="xs" weight="bold">{name}</Text></View>
    </PointAnnotation>
  </MapView>;
}

const styles = StyleSheet.create({
  mapMessage: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, padding: space[4] },
});
