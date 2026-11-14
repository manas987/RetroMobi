import { Link } from "wouter";
import { Rocket } from "lucide-react";
import { useT } from "../../../i18n";
import { useMerchantQuery } from "../query";

export type DocType = "RC" | "INSURANCE" | "PERMIT" | "PUC" | "FITNESS" | "TAX";
export type DocState = "MISSING" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
export type VehicleStage = "NEEDS_INFO" | "NEEDS_FIXING" | "CHECKING" | "READY" | "SHOWING";

export interface SetupVehicle {
  id: string;
  make: string;
  model: string;
  registrationNumber: string;
  status: "ACTIVE" | "INACTIVE";
  verificationStatus: string;
  rejectionNote: string | null;
  priceSet: boolean;
  photoCount: number;
  fuelType: string | null;
  /** Papers this vehicle needs: six for petrol, four for electric (no PUC, no permit). */
  requiredDocs: DocType[];
  docs: Record<DocType, { state: DocState; id: string | null; note: string | null }>;
  missing: string[];
  stage: VehicleStage;
  canSubmit: boolean;
  waitingFor: ("shop" | "licence")[];
}

/** A named business-wide or per-shop paper, as the setup checklist reports it. */
export interface SetupPaper { type: string; state: DocState; id: string | null; note: string | null; required: boolean }

export interface SetupData {
  shop: { id: string; name: string; verificationStatus: string; rejectionNote: string | null; hasAddress: boolean; hasHours: boolean };
  licence: { status: "NONE" | "PENDING" | "ACTIVE" | "EXPIRED" | "REJECTED"; expiresAt: string | null; hasFile: boolean; rejectionNote: string | null };
  papers: { business: SetupPaper[]; shop: SetupPaper[] };
  payoutAccount: { status: "NONE" | "PENDING" | "VERIFIED" | "REJECTED" };
  minVehiclesForShop: number;
  completeVehicles: number;
  steps: { shop: boolean; licence: boolean; vehicles: boolean; payout: boolean; submitted: boolean };
  done: boolean;
  vehicles: SetupVehicle[];
}

/** Sidebar progress chip. Sits outside the page context, so it takes its inputs as props. */
export function GetListedChip({ collapsed, token, shopId }: { collapsed: boolean; token: string; shopId: string }) {
  const { t } = useT();
  const q = useMerchantQuery<SetupData>(`/shops/${shopId}/setup`, token);
  if (!q.data || q.data.done) return null;
  const n = Object.values(q.data.steps).filter(Boolean).length;
  const label = t("setup.chipTitle");

  if (collapsed) {
    return (
      <Link href="/merchant/setup" title={label} aria-label={label} className="relative mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber/20 text-ink">
        <Rocket className="h-5 w-5" aria-hidden />
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-edge" />
      </Link>
    );
  }
  return (
    <Link href="/merchant/setup" className="mx-3 mb-2 block rounded-2xl bg-amber/20 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Rocket className="h-4 w-4" aria-hidden />
        {label}
      </p>
      <div className="mt-2 h-2 rounded-full bg-surface/70" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={n}>
        <div className="h-2 rounded-full bg-amber-edge" style={{ width: `${(n / 5) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-ink-2">{t("setup.chipProgress", { n })}</p>
    </Link>
  );
}
