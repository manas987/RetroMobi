import { StyleSheet, View } from "react-native";
import { ErrorNote, Switch, Text, api, colors, space, useT, type Row, type Tone } from "@retromobi/mobile-shared";
import { useMerchantQuery } from "../../state/query";
import { useMerchantShop } from "../../state/shop";
import { useCounterWrite } from "../bookings/common";
import { vehicleNow, type Staged } from "./vehicleNow";
import { StatusBadge } from "../../ui/Counter";

export const STAGES = ["NEEDS_INFO", "NEEDS_FIXING", "CHECKING", "READY", "SHOWING"] as const;
export type VehicleStage = (typeof STAGES)[number];
export type SetupVehicle = {
  id: string; make: string; model: string; registrationNumber: string; stage: VehicleStage; priceSet: boolean;
  missing: string[]; rejectionNote: string | null; canSubmit: boolean; waitingFor: ("shop" | "licence")[];
  requiredDocs: string[]; docs: Record<string, { state: string; id: string | null; note: string | null }>;
};
export type SetupPaper = { type: string; state: string; id: string | null; note: string | null; required: boolean };
export type SetupData = {
  shop: { id: string; name: string; verificationStatus: string; rejectionNote: string | null; hasAddress: boolean; hasHours: boolean };
  licence: { status: "NONE" | "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED"; expiresAt: string | null; hasFile: boolean; rejectionNote: string | null };
  papers: { business: SetupPaper[]; shop: SetupPaper[] };
  payoutAccount: { status: "NONE" | "PENDING" | "VERIFIED" | "REJECTED" };
  done: boolean; steps: { shop: boolean; licence: boolean; vehicles: boolean; payout: boolean; submitted: boolean }; vehicles: SetupVehicle[];
  completeVehicles: number; minVehiclesForShop: number;
};
export const STAGE_TONE: Record<VehicleStage, Tone> = { NEEDS_INFO: "muted", NEEDS_FIXING: "bad", CHECKING: "info", READY: "attention", SHOWING: "good" };
export const setupPath = (shopId: string | null) => shopId ? `/shops/${shopId}/setup` : null;
export const useSetup = (shopId: string | null) => useMerchantQuery<SetupData>(setupPath(shopId));

/** The listing switch, or the listing stage as a badge. `toggleOnly` drops the badge where the stage is already shown. */
export function Listing({ item, toggleOnly }: { item?: SetupVehicle; toggleOnly?: boolean }) {
  const { t } = useT();
  const { can } = useMerchantShop();
  const { busy, error, run } = useCounterWrite();
  if (!item) return null;
  const on = item.stage === "SHOWING";
  const toggle = can("fleet:write") && (on || item.stage === "READY");
  if (!toggle && toggleOnly) return null;
  return <View style={{ gap: space[2] }}>
    {toggle ? <View style={{ flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }}>
      <Text size="sm" color={on ? "verified" : "ink2"} style={{ flex: 1, minWidth: 0 }}>{t(on ? "fleet.listingOn" : "fleet.listingReady")}</Text>
      <Switch accessibilityLabel={t("fleet.toggleLabel", { vehicle: item.registrationNumber })} value={on} disabled={busy}
        onValueChange={(active) => void run(async () => { await api(`/vehicles/${item.id}`, { method: "PATCH", body: { status: active ? "ACTIVE" : "INACTIVE" } }); })} />
    </View> : <StatusBadge tone={STAGE_TONE[item.stage]} label={t(`fleet.stage_${item.stage}`)} />}
    {error && <ErrorNote text={error} />}
  </View>;
}

export function AvailChip({ vehicle, staged }: { vehicle: Row; staged: Staged[] }) {
  const { t, date, time } = useT();
  const { avail, blockedUntil, out, goes, late, missed } = vehicleNow(vehicle, staged);
  const when = (at: unknown) => `${date(at, { weekday: "short", day: "numeric" })} · ${time(at)}`;
  if (late) return <StatusBadge tone="bad" label={t("fleet.avail_LATE")} />;
  if (missed) return <StatusBadge tone="bad" label={t("status.stage_PICKUP_LATE")} />;
  if (avail === "OUT") return <StatusBadge tone="info" label={t("fleet.avail_OUT", { when: when(out!.b.scheduled_return_at) })} />;
  if (avail === "BLOCKED") return <StatusBadge tone="muted" label={t("fleet.avail_BLOCKED", { when: when(blockedUntil) })} />;
  if (avail === "TODAY") return <StatusBadge tone="attention" label={t("fleet.avail_TODAY", { when: when(goes!.b.scheduled_pickup_at) })} />;
  return <StatusBadge tone="good" label={t("fleet.avail_FREE")} />;
}
