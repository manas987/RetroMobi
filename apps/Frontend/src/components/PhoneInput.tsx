import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "../lib/countries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function PhoneInput({
  value,
  onChange,
  country,
  onCountryChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  country: Country;
  onCountryChange: (c: Country) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center rounded-full border border-line-strong focus-within:border-ink focus-within:ring-1 focus-within:ring-ink transition-colors overflow-hidden">
        <Select
          value={country.code}
          onValueChange={(code) => {
            const next = COUNTRIES.find((c) => c.code === code);
            if (next) onCountryChange(next);
          }}
        >
          <SelectTrigger
            aria-label="Country code"
            className="h-auto shrink-0 self-stretch rounded-none border-0 border-r border-line bg-transparent px-3 text-ink-2"
          >
            <SelectValue>
              {country.flag} {country.dial}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.dial} · {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="tel"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder="Mobile number"
          className="flex-1 min-w-0 px-3 py-2.5 text-sm outline-none"
        />
      </div>
    </div>
  );
}

export { DEFAULT_COUNTRY };
