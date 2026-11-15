import { useEffect, useRef, useState, type DragEvent } from "react";
import { useQueries } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bike, Check, ChevronRight, Kanban, LayoutList, Search } from "lucide-react";
import { portalFetch, type Row } from "../../../lib/portal";
import { rupees } from "../../../lib/format";
import { bookingStage } from "../../../lib/bookingStage";
import { can as hasPermission } from "../../../lib/permissions";
import { useT } from "../../../i18n";
import { useMerchantShop } from "../Layout";
import { errorText, merchantQuery, useInvalidateMerchant, useUrlParam } from "../query";
import { Card, Chip, ConfirmSheet, EmptyState, ErrorNote, INPUT, LoadingRows, Select, ViewToggle } from "../ui/ui";
import { AvailChip } from "../fleet/VehicleCard";
import { STAGE_TONE } from "../fleet/SetupBoard";
import type { Staged } from "../fleet/vehicleNow";
import type { SetupData, VehicleStage } from "../setup/GetListedChip";

interface Branch {
  id: string;
  name: string;
  city: string;
  owner: string;
  /** Can this person add or move vehicles here? */
  write: boolean;
}

interface Item {
  id: string;
  row: Row;
  name: string;
  plate: string;
  amount: number | null;
  branch: Branch;
  staged: Staged[];
  stage?: VehicleStage;
  /** A current or upcoming booking keeps it where the customer expects it. */
  booked: boolean;
}

const VIEWS = ["list", "board"] as const;

/**
 * Every vehicle in every branch this person can see, as a list or as a board
 * with one column per branch. A vehicle moves to another branch of the same
 * owner by dragging its card to that column, or with "Move to…" (touch,
 * keyboard), always through a confirmation.
 */
export function AllVehiclesTab() {
  const { shops, token } = useMerchantShop();
  const { t } = useT();
  const [view, setView] = useUrlParam("view", VIEWS, "list");
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState("");
  const [move, setMove] = useState<{ item: Item; to: Branch } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const branches: Branch[] = shops
    .filter((s) => hasPermission(String(s.role ?? ""), "fleet:read"))
    .map((s) => ({
      id: String(s.id),
      name: String(s.name ?? ""),
      city: String(s.city ?? ""),
      owner: String(s.merchant_user_id ?? ""),
      write: hasPermission(String(s.role ?? ""), "fleet:write"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // The same cache entries the Vehicles page and Home use for each branch.
  const vehicles = useQueries({ queries: branches.map((b) => merchantQuery<{ vehicles: Row[] }>(`/shops/${b.id}/vehicles`, token)) });
  const bookings = useQueries({ queries: branches.map((b) => merchantQuery<{ bookings: Row[] }>(`/shops/${b.id}/bookings?status=CONFIRMED`, token)) });
  const setups = useQueries({ queries: branches.map((b) => merchantQuery<SetupData>(`/shops/${b.id}/setup`, token)) });

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 5000);
    return () => clearTimeout(timer);
  }, [done]);

  if (vehicles.some((q) => q.isPending)) return <LoadingRows rows={4} />;
  if (vehicles.some((q) => q.isError)) return <ErrorNote onRetry={() => vehicles.forEach((q) => void q.refetch())} />;

  const now = new Date();
  const items: Item[] = branches.flatMap((branch, i) => {
    const staged: Staged[] = (bookings[i]?.data?.bookings ?? []).map((b) => ({ b, stage: bookingStage(b, now) }));
    const stages = new Map(setups[i]?.data?.vehicles.map((v) => [v.id, v.stage]));
    return vehicles[i]!.data!.vehicles.map((v) => {
      const id = String(v.id);
      return {
        id,
        row: v,
        name: `${String(v.make ?? "")} ${String(v.model ?? "")}`.trim(),
        plate: String(v.registration_number ?? ""),
        amount: v.amount == null ? null : Number(v.amount),
        branch,
        staged,
        stage: stages.get(id),
        booked: staged.some((x) => x.b.vehicle_id === id),
      };
    });
  });

  const needle = query.trim().toLowerCase();
  const shown = items
    .filter((x) => !needle || `${x.name} ${x.plate}`.toLowerCase().includes(needle))
    .sort((a, b) => a.branch.name.localeCompare(b.branch.name) || a.name.localeCompare(b.name));
  // Same owner, a branch where this person manages vehicles, and not where it already is.
  const targets = (x: Item) => (x.branch.write ? branches.filter((b) => b.write && b.owner === x.branch.owner && b.id !== x.branch.id) : []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t("shop.vehSearch")}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" aria-hidden />
          <input className={`${INPUT} pl-11`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("shop.vehSearch")} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {view === "list" && (
            <div className="w-56 max-w-full">
              <Select
                value={only}
                onChange={setOnly}
                placeholder={t("shop.vehAllBranches")}
                ariaLabel={t("shop.vehAllBranches")}
                options={[{ value: "", label: t("shop.vehAllBranches") }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </div>
          )}
          <ViewToggle
            value={view}
            onChange={(k) => setView(k === "list" ? null : k)}
            options={[
              { key: "list", label: t("shop.vehViewList"), icon: LayoutList },
              { key: "board", label: t("shop.vehViewBoard"), icon: Kanban },
            ]}
          />
        </div>
      </div>

      <p className="text-sm text-ink-3">
        {t("shop.vehCount", { n: items.length, m: branches.length })}
        {/* Dragging needs a mouse; on a phone "Move to…" does it. */}
        {view === "board" && branches.some((b) => b.write) && <span className="hidden [@media(hover:hover)]:inline"> · {t("shop.vehBoardHint")}</span>}
      </p>
      {done && (
        <p role="status" className="flex items-center gap-2 rounded-2xl bg-verified-soft px-4 py-3 text-sm font-medium text-verified">
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          {done}
        </p>
      )}

      {items.length === 0 ? (
        <Card><EmptyState icon={Bike} text={t("shop.vehEmpty")} /></Card>
      ) : view === "board" ? (
        <Board branches={branches} items={shown} targets={targets} onMove={(item, to) => setMove({ item, to })} />
      ) : (
        <List items={shown.filter((x) => !only || x.branch.id === only)} targets={targets} onMove={(item, to) => setMove({ item, to })} />
      )}

      <MoveSheet move={move} onClose={() => setMove(null)} onMoved={setDone} />
    </div>
  );
}

/** Name and plate; opens the vehicle in its own branch so the sidebar matches. */
function VehicleName({ item }: { item: Item }) {
  const { setShopId } = useMerchantShop();
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => {
        setShopId(item.branch.id);
        navigate(`/merchant/fleet/${item.id}`);
      }}
      className="group min-w-0 text-left"
    >
      <span className="flex items-center gap-1 text-base font-semibold text-ink">
        <span className="truncate group-hover:underline">{item.name}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      </span>
      <span className="tnum block truncate text-sm text-ink-3">{item.plate}</span>
    </button>
  );
}

function Chips({ item }: { item: Item }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.stage && <Chip tone={STAGE_TONE[item.stage]}>{t(`fleet.stage_${item.stage}` as const)}</Chip>}
      <AvailChip v={item.row} staged={item.staged} />
    </div>
  );
}

function Price({ item }: { item: Item }) {
  const { t } = useT();
  return item.amount == null ? (
    <span className="text-sm font-semibold text-danger">{t("fleet.noPrice")}</span>
  ) : (
    <span className="tnum text-sm text-ink-2">{t("common.perDay", { amount: rupees(item.amount) })}</span>
  );
}

/** "Move to…" for touch and keyboard, or why it can't move yet. */
function MoveControl({ item, targets, onMove }: { item: Item; targets: Branch[]; onMove: (to: Branch) => void }) {
  const { t } = useT();
  if (targets.length === 0) return null;
  if (item.booked) {
    return (
      <span title={t("shop.hasBookingWhy")}>
        <Chip tone="muted">{t("shop.hasBooking")}</Chip>
      </span>
    );
  }
  return (
    <div className="w-44 max-w-full">
      <Select
        compact
        value=""
        placeholder={t("shop.moveTo")}
        ariaLabel={t("shop.moveLabel", { vehicle: item.plate })}
        options={targets.map((b) => ({ value: b.id, label: b.name }))}
        onChange={(id) => {
          const to = targets.find((b) => b.id === id);
          if (to) onMove(to);
        }}
      />
    </div>
  );
}

function List({ items, targets, onMove }: { items: Item[]; targets: (x: Item) => Branch[]; onMove: (item: Item, to: Branch) => void }) {
  const { t } = useT();
  if (items.length === 0) return <Card><p className="text-base text-ink-2">{t("shop.vehNoMatch")}</p></Card>;
  const row = "grid gap-3 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_7rem_12rem] @3xl:items-center";
  return (
    <Card>
      <div className={`${row} hidden border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-ink-3 @3xl:grid`}>
        <span>{t("shop.colVehicle")}</span>
        <span>{t("shop.colBranch")}</span>
        <span>{t("shop.colStatus")}</span>
        <span>{t("shop.colPrice")}</span>
        <span />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((x) => (
          <li key={x.id} className={`${row} py-3`}>
            <VehicleName item={x} />
            <span className="min-w-0 truncate text-sm text-ink-2">
              {x.branch.name}
              {x.branch.city && <span className="text-ink-3"> · {x.branch.city}</span>}
            </span>
            <Chips item={x} />
            <Price item={x} />
            <div className="min-w-0 @3xl:justify-self-end">
              <MoveControl item={x} targets={targets(x)} onMove={(to) => onMove(x, to)} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Board({
  branches,
  items,
  targets,
  onMove,
}: {
  branches: Branch[];
  items: Item[];
  targets: (x: Item) => Branch[];
  onMove: (item: Item, to: Branch) => void;
}) {
  const { t } = useT();
  const [dragging, setDragging] = useState<Item | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // The first dragover can arrive before React re-renders with `dragging`, so the handlers read a ref.
  const dragRef = useRef<Item | null>(null);
  const canTake = (b: Branch) => dragRef.current != null && targets(dragRef.current).some((x) => x.id === b.id);
  const allowed = dragging ? new Set(targets(dragging).map((b) => b.id)) : null;

  const drop = (b: Branch) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    if (dragRef.current && canTake(b)) onMove(dragRef.current, b);
    dragRef.current = null;
    setDragging(null);
  };

  return (
    // Columns scroll sideways; each is a drop target for the branches the dragged vehicle can go to.
    <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3">
      {branches.map((b) => {
        const list = items.filter((x) => x.branch.id === b.id);
        const canDrop = allowed?.has(b.id) ?? false;
        return (
          <section
            key={b.id}
            aria-label={b.name}
            onDragOver={(e) => {
              if (!canTake(b)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(b.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === b.id ? null : o));
            }}
            onDrop={drop(b)}
            // Few branches share the width; many scroll sideways at 18rem each.
            className={`flex min-w-72 max-w-sm flex-1 basis-72 snap-start flex-col gap-3 rounded-card p-3 transition ${
              over === b.id ? "bg-amber/25 ring-2 ring-amber-edge" : canDrop ? "bg-surface-3 outline-2 outline-dashed outline-line-strong" : "bg-surface-3"
            } ${dragging && !canDrop && dragging.branch.id !== b.id ? "opacity-50" : ""}`}
          >
            <header className="flex items-start justify-between gap-2 px-1">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-ink">{b.name}</h3>
                {b.city && <p className="truncate text-xs text-ink-3">{b.city}</p>}
              </div>
              <span className="tnum rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-2">{list.length}</span>
            </header>
            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-ink-3">{t("shop.vehNone")}</p>
            ) : (
              list.map((x) => {
                const to = targets(x);
                const draggable = to.length > 0 && !x.booked;
                return (
                  <article
                    key={x.id}
                    draggable={draggable}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", x.id);
                      dragRef.current = x;
                      setDragging(x);
                    }}
                    onDragEnd={() => {
                      dragRef.current = null;
                      setDragging(null);
                      setOver(null);
                    }}
                    className={`flex flex-col gap-2.5 rounded-2xl bg-surface p-3 shadow-card ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
                      dragging?.id === x.id ? "opacity-40" : ""
                    }`}
                  >
                    <VehicleName item={x} />
                    <Chips item={x} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Price item={x} />
                      {/* With a mouse the card drags; "Move to…" is for touch. The booking chip still shows. */}
                      <div className={draggable ? "[@media(hover:hover)]:hidden" : ""}>
                        <MoveControl item={x} targets={to} onMove={(dest) => onMove(x, dest)} />
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        );
      })}
    </div>
  );
}

function MoveSheet({ move, onClose, onMoved }: { move: { item: Item; to: Branch } | null; onClose: () => void; onMoved: (note: string) => void }) {
  const { token } = useMerchantShop();
  const { t, lang } = useT();
  const invalidate = useInvalidateMerchant();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [move]);

  const vehicle = move ? `${move.item.name} · ${move.item.plate}` : "";
  const lines = move
    ? [
        t("shop.movePickup", { shop: move.to.name }),
        t("shop.moveCarries"),
        t("shop.moveHistory", { shop: move.to.name }),
        t("shop.moveStaff", { from: move.item.branch.name }),
      ]
    : [];

  async function confirm() {
    if (!move) return;
    setBusy(true);
    setError(null);
    try {
      await portalFetch("merchant", `/vehicles/${move.item.id}/move`, { method: "POST", token, body: { toShopId: move.to.id } });
      await invalidate();
      onMoved(t("shop.moved", { vehicle, shop: move.to.name }));
      onClose();
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmSheet
      open={move != null}
      onClose={onClose}
      title={move ? t("shop.moveTitle", { vehicle, shop: move.to.name }) : ""}
      body={
        <span className="flex flex-col gap-2">
          {lines.map((line) => (
            <span key={line} className="flex gap-2">
              <Check className="mt-1 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              {line}
            </span>
          ))}
        </span>
      }
      confirmLabel={busy ? t("common.saving") : t("shop.moveConfirm")}
      busy={busy}
      error={error}
      onConfirm={confirm}
    />
  );
}
