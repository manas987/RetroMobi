import { Briefcase, Crown, UserRound, type LucideIcon } from "lucide-react";
import { useT, type TKey } from "../../../i18n";
import { TONE } from "../ui/ui";

export const ROLES = ["OWNER", "MANAGER", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { icon: LucideIcon; desc: TKey }> = {
  OWNER: { icon: Crown, desc: "staff.roleOwnerDesc" },
  MANAGER: { icon: Briefcase, desc: "staff.roleManagerDesc" },
  STAFF: { icon: UserRound, desc: "staff.roleStaffDesc" },
};

/** What each role can do, with how many people hold it. */
export function RoleCards({ counts }: { counts: Record<Role, number> }) {
  const { t } = useT();
  return (
    <div className="grid gap-3 grid-cols-1 @lg:grid-cols-3 mb-6">
      {ROLES.map((r) => {
        const { icon: Icon, desc } = ROLE_META[r];
        return (
          <div key={r} className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-card">
            <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONE.muted.icon}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">{t(`common.role_${r}`)}</p>
              <p className="text-sm text-ink-2">{t(desc)}</p>
              <p className="tnum mt-1 text-xs font-medium text-ink-3">{t(counts[r] === 1 ? "staff.people_one" : "staff.people_other", { n: counts[r] })}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
