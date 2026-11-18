import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// IST calendar days, inclusive. No `from` means "all time": from the shop's
// first rental. Capped at ten years so one request can't ask generate_series
// for a century of rows.
export const SummaryQuerySchema = z
  .object({ from: day.optional(), to: day })
  .refine((q) => !q.from || q.from <= q.to, { message: "from must not be after to" })
  .refine((q) => !q.from || (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 3660, {
    message: "range is limited to ten years",
  });
