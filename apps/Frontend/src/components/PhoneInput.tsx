import { COUNTRIES, DEFAULT_COUNTRY, type Country } from "../lib/countries";

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
        <select
          value={country.code}
          onChange={(e) => {
            const next = COUNTRIES.find((c) => c.code === e.target.value);
            if (next) onCountryChange(next);
          }}
          className="shrink-0 bg-transparent px-2.5 py-2.5 text-sm text-ink-2 border-r border-line outline-none"
          aria-label="Country code"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.dial}
            </option>
          ))}
        </select>
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
