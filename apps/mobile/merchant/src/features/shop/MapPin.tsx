import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import Mapbox, { Camera, MapView, PointAnnotation } from "@rnmapbox/maps";
import { Accuracy, getCurrentPositionAsync, requestForegroundPermissionsAsync } from "expo-location";
import { MapPin as PinIcon, LocateFixed } from "lucide-react-native";
import { Button, ErrorNote, Text, colors, radius, space, useT } from "@retromobi/mobile-shared";
import { Fields } from "../fleet/tabs/Fields";

export type ShopPin = [longitude: number, latitude: number];
const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
const defaultPosition: ShopPin = [78.0322, 30.3165];

export function MapPin({ value, onChange, readOnly = false }: { value: ShopPin | null; onChange: (pin: ShopPin) => void; readOnly?: boolean }) {
  const { t, lang } = useT();
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const camera = useRef<ComponentRef<typeof Camera>>(null);

  useEffect(() => {
    let live = true;
    if (token?.startsWith("pk.")) {
      void Mapbox.setAccessToken(token).then(() => { if (live) setMapReady(true); })
        .catch(() => { if (live) setMapReady(false); });
    }
    return () => { live = false; };
  }, []);

  function set(coordinates: readonly number[]) {
    const [lon, lat] = coordinates;
    if (lon !== undefined && lat !== undefined && Number.isFinite(lon) && Number.isFinite(lat)
        && Math.abs(lon) <= 180 && Math.abs(lat) <= 90) onChange([lon, lat]);
  }

  async function locate() {
    if (readOnly || busy) return;
    setBusy(true); setError(null); setSettings(false);
    try {
      const permission = await requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError(lang === "hi" ? "लोकेशन की अनुमति दें या नक्शे पर पिन रखें।" : "Allow location access or place the pin on the map.");
        setSettings(!permission.canAskAgain);
        return;
      }
      const { coords } = await getCurrentPositionAsync({ accuracy: Accuracy.High });
      const position: ShopPin = [coords.longitude, coords.latitude];
      set(position);
      camera.current?.flyTo(position, 350);
    } catch { setError(t("common.couldntLoad")); }
    finally { setBusy(false); }
  }

  return <Fields>
    <Text weight="medium">{t("setup.pinLabel")}</Text>
    {mapReady && <View style={styles.frame}>
      <MapView style={styles.map} styleURL={Mapbox.StyleURL.Street} pitchEnabled={false} rotateEnabled={false}
        onPress={readOnly ? undefined : (feature) => set(feature.geometry.coordinates)}>
        <Camera ref={camera} defaultSettings={{ centerCoordinate: value ?? defaultPosition, zoomLevel: value ? 15 : 11 }} />
        {value && <PointAnnotation id="shop-pin" coordinate={value} draggable={!readOnly} onDragEnd={(event) => set(event.geometry.coordinates)}>
          <View style={styles.pin}><PinIcon size={26} color={colors.ink} /></View>
        </PointAnnotation>}
      </MapView>
    </View>}
    {value && <Text size="sm" color="ink2">{value[1].toFixed(5)}, {value[0].toFixed(5)}</Text>}
    {error && <ErrorNote text={error} />}
    {!readOnly && <>
      <Button label={lang === "hi" ? "मेरी मौजूदा जगह इस्तेमाल करें" : "Use my current location"} icon={LocateFixed} busy={busy} onPress={() => void locate()} />
      {settings && <Button label={lang === "hi" ? "सेटिंग खोलें" : "Open settings"} onPress={() => void Linking.openSettings().catch(() => {})} />}
    </>}
  </Fields>;
}

const styles = StyleSheet.create({
  frame: { height: 240, overflow: "hidden", borderRadius: radius.panel, backgroundColor: colors.surface3 },
  map: { flex: 1 },
  pin: { backgroundColor: colors.amber, borderRadius: radius.full, padding: space[1] },
});
