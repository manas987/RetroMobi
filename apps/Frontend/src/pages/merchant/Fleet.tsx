import { useState } from "react";
import { CalendarRange, Eye, LayoutGrid, Plus, Rocket } from "lucide-react";
import { useT } from "../../i18n";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { useUrlParam, useUrlString } from "./query";
import { WalkinSheet } from "./bookingActions";
import { Button, PageHeader, ViewToggle } from "./ui/ui";
import { AddVehicleSheet } from "./fleet/AddVehicleSheet";
import { FleetList } from "./fleet/FleetList";
import { FleetTimeline } from "./fleet/FleetTimeline";
import { SetupBoard, useSetup } from "./fleet/SetupBoard";
import { ShowAllReady } from "./fleet/ShowAllReady";

function FleetBody() {
  const { can } = useMerchantShop();
  const { t } = useT();
  const [view, setView] = useUrlParam("view", ["list", "calendar", "setup"] as const, "list");
  const [add, setAdd] = useUrlString("add");
  const [showAll, setShowAll] = useState(false);
  const [walkin, setWalkin] = useState<{ vehicleId: string; startDay?: string } | null>(null);
  const ready = (useSetup().data?.vehicles ?? []).filter((v) => v.stage === "READY").map((v) => v.id);
  const write = can("fleet:write");

  return (
    <div>
      <PageHeader
        title={t("fleet.title")}
        subtitle={t("fleet.subtitle")}
        actions={write && (
          <>
            {ready.length > 0 && <Button icon={Eye} onClick={() => setShowAll(true)}>{t("fleet.showAll")}</Button>}
            <Button variant="primary" icon={Plus} onClick={() => setAdd("1")}>{t("fleet.addVehicle")}</Button>
          </>
        )}
      />
      <div className="mb-5 overflow-x-auto">
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { key: "list", label: t("fleet.viewList"), icon: LayoutGrid },
            { key: "calendar", label: t("fleet.viewCalendar"), icon: CalendarRange },
            { key: "setup", label: t("fleet.viewSetup"), icon: Rocket },
          ]}
        />
      </div>

      {view === "list" && <FleetList onAdd={() => setAdd("1")} onBook={(vehicleId) => setWalkin({ vehicleId })} />}
      {view === "calendar" && <FleetTimeline onAdd={() => setAdd("1")} onBook={(vehicleId, startDay) => setWalkin({ vehicleId, startDay })} />}
      {view === "setup" && <SetupBoard />}

      <AddVehicleSheet open={add === "1"} onClose={() => setAdd(null)} />
      <ShowAllReady open={showAll} onClose={() => setShowAll(false)} ids={ready} />
      <WalkinSheet open={walkin != null} vehicleId={walkin?.vehicleId} startDay={walkin?.startDay} onClose={() => setWalkin(null)} />
    </div>
  );
}

export function MerchantFleet() {
  return (
    <MerchantLayout>
      <FleetBody />
    </MerchantLayout>
  );
}
