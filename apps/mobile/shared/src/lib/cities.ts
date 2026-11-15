/** Launch cities, with the one-line blurbs from the website's search panel (SearchCapsule.tsx). */
export const CITY_LIST = [
  { name: "Dehradun", blurb: "Valley base for the hills" },
  { name: "Haridwar", blurb: "Temple town on the Ganga" },
  { name: "Rishikesh", blurb: "Rafting and yoga country" },
] as const;

export const CITIES: string[] = CITY_LIST.map((c) => c.name);
