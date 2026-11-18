import { useState } from "react";
import { View, type ViewStyle } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { colors, radius, type Row } from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { isDownloadable } from "./files";

const scooter = require("../../../assets/images/ui/vehicle-scooter.png");
const bike = require("../../../assets/images/ui/vehicle-bike.png");

// ponytail: guesses motorcycle vs scooter from the model name, only for the placeholder art.
const MOTORCYCLE = /enfield|classic|bullet|hunter|meteor|himalayan|pulsar|apache|duke|\bns\d|\br15|splendor|shine|unicorn|fz|mt-?15|dominar|xpulse|bike/i;

type Named = { make?: unknown; model?: unknown };

export function placeholderFor(row: Named) {
  return MOTORCYCLE.test(`${row.make ?? ""} ${row.model ?? ""}`) ? bike : scooter;
}

/**
 * The vehicle's first photo, or friendly placeholder art while it loads, when
 * there is none, or when storage is unavailable.
 * ponytail: one media list + one signed URL request per vehicle on screen. Fine for
 * shop-sized fleets; add a cover URL to the merchant vehicles list if fleets grow past ~30.
 */
export function VehicleThumb({ vehicleId, vehicle, size = 72, height, style, base, fallback }: {
  vehicleId: string | null | undefined; vehicle: Named; size?: number; height?: number; style?: ViewStyle;
  /** Another media list with the same shape (the shop's photos). */ base?: string;
  /** Full-bleed art instead of the scooter/bike cut-out. */ fallback?: ImageProps["source"];
}) {
  const root = base ?? (vehicleId ? `/vehicles/${vehicleId}/media` : null);
  const media = useMerchantQuery<{ media: Row[] }>(root);
  const first = media.data?.media.find((m) => m.type === "IMAGE" && m.published) ?? media.data?.media.find((m) => m.type === "IMAGE");
  const download = useMerchantQuery<{ downloadUrl: string }>(first && root ? `${root}/${first.id}/download` : null);
  const url = download.data?.downloadUrl;
  const [failed, setFailed] = useState<string | null>(null);
  const photo = isDownloadable(url) && url !== failed;
  const box: ViewStyle = { width: height ? "100%" : size, height: height ?? size, borderRadius: height ? radius.hero : radius.panel, overflow: "hidden",
    backgroundColor: photo ? colors.surface3 : colors.amberSoft, alignItems: "center", justifyContent: "center" };
  return <View style={[box, style]} accessible={false}>
    {photo ? <Image source={{ uri: url, cacheKey: String(first!.id) }} recyclingKey={String(first!.id)} cachePolicy="memory-disk" transition={150}
      contentFit="cover" onError={() => setFailed(url)} style={{ width: "100%", height: "100%" }} />
      : fallback ? <Image source={fallback} contentFit="cover" style={{ width: "100%", height: "100%" }} />
      : <Image source={placeholderFor(vehicle)} contentFit="contain" style={{ width: "86%", height: "86%" }} />}
  </View>;
}
