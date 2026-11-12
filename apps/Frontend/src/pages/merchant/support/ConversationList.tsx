import { MessageCircle } from "lucide-react";
import type { Row } from "../../../lib/portal";
import { istDay } from "../../../lib/format";
import { useT, type TKey } from "../../../i18n";
import { Chip, EmptyState } from "../ui/ui";

export const CATEGORY: Record<string, TKey> = {
  BOOKING: "support.catBOOKING",
  APP_HELP: "support.catAPP_HELP",
  OTHER: "support.catOTHER",
};

export function ConversationList({ tickets, activeId, onOpen }: { tickets: Row[]; activeId: string | null; onOpen: (id: string) => void }) {
  const { t, date, time } = useT();
  if (tickets.length === 0) return <EmptyState icon={MessageCircle} text={t("support.empty")} />;
  const when = (iso: unknown) => (iso && istDay(new Date(String(iso))) === istDay(new Date()) ? time(iso) : date(iso));
  return (
    <ul className="flex flex-col gap-2">
      {tickets.map((tk) => {
        const id = String(tk.id);
        const cat = CATEGORY[String(tk.category)];
        const waiting = tk.status !== "RESOLVED" && tk.latest_is_mine === false && !!tk.latest_message;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onOpen(id)}
              aria-current={id === activeId}
              className={`w-full rounded-2xl p-3 text-left min-h-11 ${id === activeId ? "bg-amber/20" : "bg-surface-2 hover:bg-surface-3"}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{tk.subject ? String(tk.subject) : cat ? t(cat) : t("support.conversation")}</span>
                <span className="tnum shrink-0 text-xs text-ink-3">{when(tk.latest_message_at ?? tk.created_at)}</span>
              </span>
              {tk.registration_number != null && <span className="tnum block text-xs text-ink-3">{String(tk.registration_number)}</span>}
              {tk.latest_message != null && <span className="mt-0.5 block truncate text-sm text-ink-2">{String(tk.latest_message)}</span>}
              <span className="mt-2 block">
                {tk.status === "RESOLVED" ? <Chip tone="muted">{t("support.solved")}</Chip>
                  : waiting ? <Chip tone="attention">{t("support.waitingReply")}</Chip>
                  : <Chip tone="info">{t("support.open")}</Chip>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
