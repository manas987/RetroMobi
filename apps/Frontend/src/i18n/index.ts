import { useSyncExternalStore } from "react";
import enCommon from "./en/common";
import enNav from "./en/nav";
import enStatus from "./en/status";
import enOverview from "./en/overview";
import enActions from "./en/actions";
import enErrors from "./en/errors";
import enBookings from "./en/bookings";
import enFleet from "./en/fleet";
import enSetup from "./en/setup";
import enShop from "./en/shop";
import enStaff from "./en/staff";
import enMoney from "./en/money";
import enSupport from "./en/support";
import enWallet from "./en/wallet";
import hiCommon from "./hi/common";
import hiNav from "./hi/nav";
import hiStatus from "./hi/status";
import hiOverview from "./hi/overview";
import hiActions from "./hi/actions";
import hiErrors from "./hi/errors";
import hiBookings from "./hi/bookings";
import hiFleet from "./hi/fleet";
import hiSetup from "./hi/setup";
import hiShop from "./hi/shop";
import hiStaff from "./hi/staff";
import hiMoney from "./hi/money";
import hiSupport from "./hi/support";
import hiWallet from "./hi/wallet";

/**
 * Merchant-console strings. English is the source; every Hindi file is typed
 * against its English twin with `satisfies Record<keyof typeof en, string>`,
 * so a missing or misspelt Hindi key fails `tsc` rather than shipping.
 *
 * One file per feature so work on different pages never edits the same
 * dictionary. Adding a namespace = one import per language + one line in each
 * object below.
 */
const en = {
  common: enCommon,
  nav: enNav,
  status: enStatus,
  overview: enOverview,
  actions: enActions,
  errors: enErrors,
  bookings: enBookings,
  fleet: enFleet,
  setup: enSetup,
  shop: enShop,
  staff: enStaff,
  money: enMoney,
  support: enSupport,
  wallet: enWallet,
};

type Dict = typeof en;
const hi: { [N in keyof Dict]: Record<keyof Dict[N], string> } = {
  common: hiCommon,
  nav: hiNav,
  status: hiStatus,
  overview: hiOverview,
  actions: hiActions,
  errors: hiErrors,
  bookings: hiBookings,
  fleet: hiFleet,
  setup: hiSetup,
  shop: hiShop,
  staff: hiStaff,
  money: hiMoney,
  support: hiSupport,
  wallet: hiWallet,
};

export type Lang = "en" | "hi";
export type TKey = { [N in keyof Dict]: `${N}.${keyof Dict[N] & string}` }[keyof Dict];
export type TVars = Record<string, string | number>;

const DICTS: Record<Lang, Record<string, Record<string, string>>> = { en, hi };

/** `{name}` placeholders are filled from `vars`; an unknown key falls back to
 *  English, then to the key itself, so a gap is visible but never a crash. */
export function translate(lang: Lang, key: string, vars?: TVars): string {
  const dot = key.indexOf(".");
  const ns = key.slice(0, dot);
  const k = key.slice(dot + 1);
  const raw = DICTS[lang][ns]?.[k] ?? DICTS.en[ns]?.[k] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : raw;
}

/** For keys built at runtime (enum values from the server). */
export function hasKey(key: string): boolean {
  const dot = key.indexOf(".");
  return DICTS.en[key.slice(0, dot)]?.[key.slice(dot + 1)] !== undefined;
}

// ---- language store: localStorage + a listener set, no provider needed ----

const STORAGE_KEY = "retromobi_lang";
const listeners = new Set<() => void>();

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}

let current: Lang = typeof window === "undefined" ? "en" : readLang();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode: the switch still works for this visit.
  }
  document.documentElement.lang = lang;
  listeners.forEach((l) => l());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => "en",
  );
}

const LOCALE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

/**
 * Everything a screen needs to speak the merchant's language: `t` for strings
 * and IST-pinned date/number formatting in the matching locale. Numbers stay
 * in Latin digits, which is also hi-IN's default.
 */
export function useT() {
  const lang = useLang();
  const locale = LOCALE[lang];
  return {
    lang,
    t: (key: TKey, vars?: TVars) => translate(lang, key, vars),
    /** Untyped lookup for runtime keys; returns null when the key doesn't exist. */
    tMaybe: (key: string, vars?: TVars) => (hasKey(key) ? translate(lang, key, vars) : null),
    date: (iso: unknown, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
      iso ? new Date(String(iso)).toLocaleDateString(locale, { timeZone: "Asia/Kolkata", ...opts }) : "—",
    time: (iso: unknown) =>
      iso
        ? new Date(String(iso)).toLocaleTimeString(locale, {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            minute: "2-digit",
            // Hindi says the part of the day ("शाम 7:00"), not "7:00 pm".
            ...(lang === "hi" ? { dayPeriod: "short" } : { hour12: true }),
          })
        : "—",
    number: (n: number) => n.toLocaleString(locale),
  };
}
