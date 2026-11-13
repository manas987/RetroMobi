import { useEffect, useState } from "react";
import { CalendarDays, List, Plus, Search } from "lucide-react";
import type { Row } from "../../lib/portal";
import { useT } from "../../i18n";
import { MerchantLayout, useMerchantShop } from "./Layout";
import { useMerchantQuery, useUrlParam, useUrlString } from "./query";
import { HandoverSheet, ReturnSheet, WalkinSheet } from "./bookingActions";
import { BookingCalendar } from "./bookings/BookingCalendar";
import { BookingList } from "./bookings/BookingList";
import { BookingSheet } from "./bookings/BookingSheet";
import type { Filters } from "./bookings/filters";
import { Button, INPUT, PageHeader, Select, ViewToggle } from "./ui/ui";

export function MerchantBookings() {
  return (
    <MerchantLayout>
      <BookingsBody />
    </MerchantLayout>
  );
}

function BookingsBody() {
  const { token, shopId, can } = useMerchantShop();
  const { t } = useT();
  const [view, setView] = useUrlParam("view", ["list", "calendar"] as const, "list");
  const [bookingId, setBookingId] = useUrlString("booking");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [source, setSource] = useState<Filters["source"]>("");
  const [vehicleId, setVehicleId] = useState("");
  const [walkin, setWalkin] = useState<{ startDay?: string } | null>(null);
  const [handover, setHandover] = useState<Row | null>(null);
  const [returning, setReturning] = useState<Row | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(id);
  }, [text]);

  const vehicles = useMerchantQuery<{ vehicles: Row[] }>(shopId ? `/shops/${shopId}/vehicles` : null, token);
  const filters: Filters = { q, source, vehicleId };
  const actions = { onOpen: setBookingId, onHandover: setHandover, onReturn: setReturning };
  const clear = () => { setText(""); setQ(""); setSource(""); setVehicleId(""); };

  return (
    <div>
      <PageHeader
        title={t("bookings.title")}
        subtitle={t("bookings.subtitle")}
        actions={can("bookings:write") && (
          <Button variant="primary" size="lg" icon={Plus} onClick={() => setWalkin({})}>{t("bookings.newWalkin")}</Button>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ViewToggle
          value={view}
          onChange={setView}
          options={[
            { key: "list", label: t("bookings.viewList"), icon: List },
            { key: "calendar", label: t("bookings.viewCalendar"), icon: CalendarDays },
          ]}
        />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("bookings.searchPlaceholder")}
            aria-label={t("common.search")}
            className={INPUT}
            style={{ paddingLeft: 44 }}
          />
        </div>
        {/* Side by side on a phone, so the list starts higher. */}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Select
          ariaLabel={t("bookings.filterSource")}
          value={source}
          onChange={(v) => setSource(v as Filters["source"])}
          className="sm:w-40"
          options={[
            { value: "", label: t("bookings.allSources") },
            { value: "ONLINE", label: t("common.online") },
            { value: "OFFLINE", label: t("common.walkin") },
          ]}
        />
        <Select
          ariaLabel={t("bookings.filterVehicle")}
          value={vehicleId}
          onChange={setVehicleId}
          className="sm:w-60"
          options={[
            { value: "", label: t("bookings.allVehicles") },
            ...(vehicles.data?.vehicles ?? []).map((v) => ({
              value: String(v.id),
              label: `${String(v.make)} ${String(v.model)} · ${String(v.registration_number)}`,
            })),
          ]}
        />
        </div>
      </div>

      {view === "list" ? (
        <BookingList filters={filters} actions={actions} onNewWalkin={() => setWalkin({})} onClear={clear} />
      ) : (
        <BookingCalendar filters={filters} actions={actions} onNewWalkin={(startDay) => setWalkin({ startDay })} />
      )}

      <BookingSheet id={bookingId} onClose={() => setBookingId(null)} actions={actions} />
      <WalkinSheet open={walkin != null} startDay={walkin?.startDay} onClose={() => setWalkin(null)} />
      <HandoverSheet booking={handover} onClose={() => setHandover(null)} />
      <ReturnSheet booking={returning} onClose={() => setReturning(null)} />
    </div>
  );
}
