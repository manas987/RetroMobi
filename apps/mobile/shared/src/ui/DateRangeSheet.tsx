import { useState } from "react";
import { View } from "react-native";
import { istBookingTime, monthOf, splitIstBookingTime, type DateWindow } from "../lib/calendar";
import { tapDay } from "../lib/dateRange";
import { formatClock, formatIstTime, istDay, type Lang } from "../lib/format";
import { space } from "../theme";
import { MonthGrid } from "./MonthGrid";
import { Sheet } from "./Sheet";
import { SelectOptions } from "./SelectSheet";
import { Button } from "./Button";
import { Text } from "./Text";

const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

export function DateRangeSheet({ open, onClose, value, onChange, lang = "en", monochrome = false }: {
  open: boolean; onClose: () => void; value?: DateWindow; onChange: (window: DateWindow) => void; lang?: Lang; monochrome?: boolean;
}) {
  return open ? <RangeEditor onClose={onClose} value={value} onChange={onChange} lang={lang} monochrome={monochrome} /> : null;
}

function RangeEditor({ onClose, value, onChange, lang, monochrome }: {
  onClose: () => void; value?: DateWindow; onChange: (window: DateWindow) => void; lang: Lang; monochrome: boolean;
}) {
  const today = istDay(new Date());
  const pickup = value ? splitIstBookingTime(value.pickupAt) : null;
  const end = value ? splitIstBookingTime(value.returnAt) : null;
  const [from, setFrom] = useState(pickup && pickup.day >= today ? pickup.day : "");
  const [to, setTo] = useState(pickup && pickup.day >= today && end ? end.day : "");
  const [month, setMonth] = useState(() => monthOf(from || today));
  const [pickupTime, setPickupTime] = useState(pickup?.time ?? "10:00");
  const [returnTime, setReturnTime] = useState(end?.time ?? "22:00");
  const [editingTime, setEditingTime] = useState<"pickup" | "return" | null>(null);
  const hi = lang === "hi";
  const pickupAt = from && istBookingTime(from, pickupTime);
  const returnAt = to && istBookingTime(to, returnTime);
  const validWindow = !!pickupAt && !!returnAt && Date.parse(returnAt) > Date.parse(pickupAt) && Date.parse(pickupAt) >= Date.now();
  const timeLabel = (time: string) => hi ? formatIstTime(istBookingTime(today, time), lang) : formatClock(time);
  const pickupLabel = hi ? "पिकअप का समय" : "Pick-up time";
  const returnLabel = hi ? "वापसी का समय" : "Return time";
  const closeLabel = hi ? "बंद करें" : "Close";

  if (editingTime) {
    const value = editingTime === "pickup" ? pickupTime : returnTime;
    const options = [...new Set([...times, value])].sort().map((time) => ({ value: time, label: timeLabel(time) }));
    // Keep one native modal on screen when changing between the calendar and time list.
    return <Sheet open scroll={false} onClose={() => setEditingTime(null)} closeLabel={closeLabel}
      title={editingTime === "pickup" ? pickupLabel : returnLabel}>
      <SelectOptions options={options} value={value} onChange={(next) => {
        if (editingTime === "pickup") setPickupTime(next);
        else setReturnTime(next);
        setEditingTime(null);
      }} />
    </Sheet>;
  }

  return (
    <Sheet open onClose={onClose} closeLabel={closeLabel} title={hi ? "तारीखें" : "Dates"} footer={
      <Button full variant="primary" label={hi ? "तारीखें चुनें" : "Apply dates"} disabled={!validWindow}
        onPress={() => { if (validWindow) { onChange({ pickupAt, returnAt }); onClose(); } }} />
    }>
      <View style={{ gap: space[3] }}>
        <Text size="sm" color="ink2">
          {to ? (hi ? "अब पिकअप और वापसी का समय चुनें" : "Check your pick-up and return times")
            : from ? (hi ? "वापसी की तारीख चुनें" : "Choose your return date")
            : (hi ? "पिकअप की तारीख चुनें" : "Choose your pick-up date")}
        </Text>
        <MonthGrid monochrome={monochrome} month={month} onMonthChange={setMonth} lang={lang} min={today}
          selected={from ? (to ? { from, to } : from) : undefined}
          onPress={(day) => {
            // The shared range rule uses local calendar parts; noon is only a calendar marker here.
            const marker = (d: string) => new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), 12);
            const result = tapDay(from && !to ? marker(from) : null, marker(day));
            if (result.commit) setTo(day);
            else { setFrom(day); setTo(""); }
          }} />
        <Button label={`${pickupLabel} · ${timeLabel(pickupTime)}`} onPress={() => setEditingTime("pickup")} />
        <Button label={`${returnLabel} · ${timeLabel(returnTime)}`} onPress={() => setEditingTime("return")} />
        {!!to && !validWindow && <Text color="danger" size="sm" accessibilityRole="alert">
          {hi ? "आने वाला पिकअप समय चुनें। वापसी पिकअप के बाद होनी चाहिए।" : "Choose a future pick-up time and a return after pick-up."}
        </Text>}
      </View>
    </Sheet>
  );
}
