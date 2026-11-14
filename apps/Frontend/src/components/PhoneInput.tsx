import { useState } from "react";
import { COUNTRIES, DEFAULT_COUNTRY, splitPhone, type Country } from "../lib/countries";
import { cn } from "../lib/cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export function PhoneInput({
  value,
  onChange,
  country,
  onCountryChange,
  autoFocus,
  className,
  placeholder = "Mobile number",
}: {
  value: string;
  onChange: (v: string) => void;
  country: Country;
  onCountryChange: (c: Country) => void;
  autoFocus?: boolean;
  /** Outer box, to match a form's own inputs (height, radius, text size). */
  className?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <div className={cn("flex items-center text-sm rounded-full border border-line-strong focus-within:border-ink focus-within:ring-1 focus-within:ring-ink transition-colors overflow-hidden", className)}>
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
          placeholder={placeholder}
          className="tnum flex-1 min-w-0 self-stretch bg-transparent px-3 py-2.5 text-[length:inherit] outline-none"
        />
      </div>
    </div>
  );
}

export { DEFAULT_COUNTRY };

/**
 * PhoneInput for forms that keep one "+919812340001" string: the country
 * picker and the digits stay apart on screen, `onChange` gets them joined
 * ("" while no digits are typed).
 */
export function E164Input({ value, onChange, className, placeholder }: { value: string; onChange: (e164: string) => void; className?: string; placeholder?: string }) {
  const [country, setCountry] = useState(() => splitPhone(value).country);
  const local = value.startsWith(country.dial) ? value.slice(country.dial.length) : splitPhone(value).local;
  const join = (c: Country, digits: string) => onChange(digits ? `${c.dial}${digits}` : "");
  return (
    <PhoneInput
      value={local}
      onChange={(digits) => join(country, digits)}
      country={country}
      onCountryChange={(c) => { setCountry(c); join(c, local); }}
      className={className}
      placeholder={placeholder}
    />
  );
}
