import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

/** A ride the rider hearted, with enough to draw a tile without a request. */
export type SavedRide = { vehicleId: string; modelId: string; imageKey: string | null; make: string; model: string; shopName: string; pricePerDay: number };

// ponytail: saved rides live on this phone only (no backend for favourites). Move to an
// account endpoint if riders need them across devices.
const KEY = "retromobi.saved.v1";
let rides: SavedRide[] = [];
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function load() {
  if (started) return;
  started = true;
  void AsyncStorage.getItem(KEY).then((raw) => {
    const value: unknown = raw ? JSON.parse(raw) : [];
    rides = Array.isArray(value) ? value.filter((r) => typeof r?.vehicleId === "string" && typeof r?.modelId === "string") : [];
    emit();
  }).catch(() => {});
}

export function toggleSaved(ride: SavedRide) {
  rides = rides.some((r) => r.modelId === ride.modelId) ? rides.filter((r) => r.modelId !== ride.modelId) : [ride, ...rides].slice(0, 30);
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(rides)).catch(() => {});
}

export function useSaved() {
  useEffect(load, []);
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => rides);
}
