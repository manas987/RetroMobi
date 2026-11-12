import { Bike, Plus } from "lucide-react";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { Button, Card, Chip, EmptyState, ErrorNote, LoadingRows } from "../ui/ui";
import { VehicleCard } from "./VehicleCard";
import { useSetup, useVehicles } from "./SetupBoard";
import { useStagedBookings, vehicleNow } from "./vehicleNow";

/** The empty fleet, reused by the timeline. */
export function NoVehicles({ onAdd }: { onAdd: () => void }) {
  const { can } = useMerchantShop();
  const { t } = useT();
  return (
    <Card>
      <EmptyState icon={Bike} text={t("fleet.empty")}
        action={can("fleet:write") ? <Button variant="primary" icon={Plus} onClick={onAdd}>{t("fleet.addVehicle")}</Button> : undefined} />
    </Card>
  );
}

export function FleetList({ onAdd, onBook }: { onAdd: () => void; onBook: (vehicleId: string) => void }) {
  const { t } = useT();
  const vehicles = useVehicles();
  const setup = useSetup();
  const { query: bookings, staged } = useStagedBookings();

  if (vehicles.isPending) return <LoadingRows rows={4} />;
  if (vehicles.isError) return <ErrorNote onRetry={() => vehicles.refetch()} />;
  const list = vehicles.data.vehicles;
  if (list.length === 0) return <NoVehicles onAdd={onAdd} />;

  const tally = { FREE: 0, TODAY: 0, OUT: 0 };
  for (const v of list) tally[vehicleNow(v.id, staged).avail]++;
  const sv = new Map(setup.data?.vehicles.map((x) => [x.id, x]));

  return (
    <div className="@container flex flex-col gap-4">
      {bookings.isError && <ErrorNote onRetry={() => bookings.refetch()} />}
      <div className="flex flex-wrap gap-2">
        <Chip tone="good">{t("fleet.sumFree", { n: tally.FREE })}</Chip>
        <Chip tone="attention">{t("fleet.sumToday", { n: tally.TODAY })}</Chip>
        <Chip tone="info">{t("fleet.sumOut", { n: tally.OUT })}</Chip>
      </div>
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
        {list.map((v) => (
          <VehicleCard key={String(v.id)} v={v} sv={sv.get(String(v.id))} staged={staged} onBook={onBook} />
        ))}
      </div>
    </div>
  );
}
