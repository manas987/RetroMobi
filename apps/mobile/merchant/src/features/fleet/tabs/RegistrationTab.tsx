import { useState } from "react";
import { View } from "react-native";
import { IdCard } from "lucide-react-native";
import { Button, Card, DateField, EmptyState, Line, Text, api, dateLabel, type Row, type TKey, useT } from "@retromobi/mobile-shared";
import { counterStyles } from "../../../ui/Counter";
import { useMerchantQuery } from "../../../state/query";
import { useMerchantShop } from "../../../state/shop";
import { useCounterWrite } from "../../bookings/common";
import { Fields, FormButtons, LabelInput, Pending } from "./Fields";

const fields = [
  ["registrationNumber", "fleet.reg_number", false],
  ["registeringAuthority", "fleet.reg_registeringAuthority", false],
  ["engineNumber", "fleet.reg_engineNumber", false],
  ["chassisNumber", "fleet.reg_chassisNumber", false],
  ["manufacturer", "fleet.reg_manufacturer", false],
  ["financer", "fleet.reg_financer", false],
  ["cubicCapacity", "fleet.reg_cubicCapacity", true],
  ["seatingCapacity", "fleet.reg_seatingCapacity", true],
] as const satisfies readonly (readonly [string, TKey, boolean])[];
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

export function RegistrationTab({ id }: { id: string }) {
  const { t, lang } = useT();
  const { can } = useMerchantShop();
  const base = `/vehicles/${id}/registration`;
  const q = useMerchantQuery<{ record: Row | null }>(base);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [tax, setTax] = useState("");
  const write = useCounterWrite();
  if (!q.isSuccess) return <Pending error={q.error} retry={q.refetch} />;
  const record = q.data.record;
  const valid = !!form?.registrationNumber?.trim() && fields.every(([key, , numeric]) => !numeric || !form[key]?.trim() || Number.isSafeInteger(Number(form[key])) && Number(form[key]) > 0);
  const start = () => { setForm(Object.fromEntries(fields.map(([key]) => [key, String(record?.[snake(key)] ?? "")]))); setTax(String(record?.tax_valid_until ?? "").slice(0, 10)); };
  return <Card icon={IdCard} style={counterStyles.panel} title={t("fleet.regTitle")}>
    <Fields>
      <Text color="ink2">{t("fleet.regHint")}</Text>
      {form ? <>
        {fields.map(([key, label, numeric]) => <LabelInput key={key} label={t(label)} value={form[key]} keyboardType={numeric ? "number-pad" : "default"}
          autoCapitalize={key === "registrationNumber" ? "characters" : undefined}
          onChangeText={(value) => setForm({ ...form, [key]: key === "registrationNumber" ? value.toUpperCase() : value })} />)}
        <DateField inline label={t("fleet.reg_taxValidUntil")} value={tax} onChange={setTax} clearable />
        <FormButtons busy={write.busy} error={write.error} valid={valid} close={() => setForm(null)} save={() => {
          if (!valid) return;
          void write.run(async () => {
            const body: Record<string, unknown> = {};
            for (const [key, , numeric] of fields) {
              const value = form[key]?.trim();
              if (value) body[key] = numeric ? Number(value) : value;
            }
            if (tax) body.taxValidUntil = tax;
            await api(base, { method: "PUT", body });
            setForm(null);
          });
        }} />
      </> : <>
        {record ? <>
          {[...fields.map(([key, label]) => ({ label, value: String(record[snake(key)] ?? "—") })),
            { label: "fleet.reg_taxValidUntil" as const, value: dateLabel(record.tax_valid_until, lang) }].map(({ label, value }) => <View key={label}>
              <Line />
              <View style={counterStyles.row}>
                <Text size="sm" color="ink2" style={{ flex: 1 }}>{t(label)}</Text>
                <Text weight="medium" style={{ flex: 1, textAlign: "right" }}>{value}</Text>
              </View>
            </View>)}
        </> : <EmptyState text={t("fleet.regEmpty")} />}
        {can("fleet:write") && <Button label={t(record ? "fleet.regUpdate" : "fleet.regAdd")} onPress={start} />}
      </>}
    </Fields>
  </Card>;
}
