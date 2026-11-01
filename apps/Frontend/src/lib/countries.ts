export interface Country {
  code: string; // ISO 3166-1 alpha-2
  dial: string;
  flag: string;
  name: string;
}

// A working set, not every ISO country — add more as needed.
export const COUNTRIES: Country[] = [
  { code: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "United States" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "AE", dial: "+971", flag: "🇦🇪", name: "UAE" },
  { code: "SG", dial: "+65", flag: "🇸🇬", name: "Singapore" },
  { code: "AU", dial: "+61", flag: "🇦🇺", name: "Australia" },
  { code: "CA", dial: "+1", flag: "🇨🇦", name: "Canada" },
  { code: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
  { code: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
  { code: "NP", dial: "+977", flag: "🇳🇵", name: "Nepal" },
  { code: "LK", dial: "+94", flag: "🇱🇰", name: "Sri Lanka" },
  { code: "BD", dial: "+880", flag: "🇧🇩", name: "Bangladesh" },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]!;
