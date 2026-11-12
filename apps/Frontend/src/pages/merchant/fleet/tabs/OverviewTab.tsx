import { useState } from "react";
import { Link, useLocation } from "wouter";
import { CalendarCheck, Rocket, Trash2 } from "lucide-react";
import { portalFetch, type Row } from "../../../../lib/portal";
import { STAGE_TONE } from "../../../../lib/bookingStage";
import { useT } from "../../../../i18n";
import { useMerchantShop } from "../../Layout";
import { errorText } from "../../query";
import { renterName } from "../../bookingActions";
import { Button, Card, Chip, ConfirmSheet, LoadingRows } from "../../ui/ui";
import { AvailChip } from "../VehicleCard";
import { ListingBox, type SetupVehicle } from "../SetupBoard";
import { useStagedBookings } from "../vehicleNow";

const ITEM_TAB: Record<string, string> = { price: "price", photo: "photos", "doc:RC": "documents", "doc:INSURANCE": "documents", "doc:PUC": "documents" };

export function OverviewTab({ v, sv }: { v: Row; sv?: SetupVehicle }) {
  const { token, can } = useMerchantShop();
  const { t, lang, date, time } = useT();
  const [, go] = useLocation();
  const { staged } = useStagedBookings();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = String(v.id);
  const next = staged
    .filter((x) => x.b.vehicle_id === id)
    .sort((a, b) => String(a.b.scheduled_pickup_at).localeCompare(String(b.b.scheduled_pickup_at)))
    .slice(0, 3);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${id}`, { method: "DELETE", token });
      go("/merchant/fleet");
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      <Card title={t("fleet.rightNow")} icon={CalendarCheck}>
        <div className="mb-3"><AvailChip id={id} staged={staged} /></div>
        {next.length === 0 ? (
          <p className="text-sm text-ink-3">{t("fleet.noUpcoming")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {next.map(({ b, stage }) => (
              <li key={String(b.id)}>
                <Link href={`/merchant/bookings?booking=${b.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 hover:bg-surface-3">
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-semibold text-ink">{renterName(b)}</span>
                    <span className="block text-xs text-ink-3">{date(b.scheduled_pickup_at, { weekday: "short", day: "numeric" })} {time(b.scheduled_pickup_at)}</span>
                  </span>
                  <Chip tone={STAGE_TONE[stage]}>{t(`status.stage_${stage}` as const)}</Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("fleet.listingTitle")} icon={Rocket}>
        {sv ? <ListingBox v={sv} itemHref={(item) => `/merchant/fleet/${id}?tab=${ITEM_TAB[item] ?? "overview"}`} /> : <LoadingRows rows={2} />}
      </Card>

      {can("fleet:write") && (
        <Card title={t("fleet.removeTitle")} icon={Trash2}>
          <p className="mb-3 text-sm text-danger">{t("fleet.removeWarn")}</p>
          <Button variant="secondary" className="self-start text-danger" onClick={() => setConfirm(true)}>{t("fleet.removeVehicle")}</Button>
          <ConfirmSheet
            open={confirm}
            onClose={() => setConfirm(false)}
            title={t("fleet.removeVehicle")}
            body={t("fleet.removeBody", { plate: String(v.registration_number ?? "") })}
            confirmLabel={t("fleet.removeYes")}
            danger
            busy={busy}
            error={error}
            onConfirm={remove}
          />
        </Card>
      )}
    </div>
  );
}
