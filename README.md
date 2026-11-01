# RetroMobi

Scooter rental marketplace for India. Customers rent a specific scooter from a licensed merchant for a time window.

**Status:** backend Phases 1–17 built and tested (`apps/Backend`); frontend has all three
surfaces scaffolded (`apps/Frontend`). Read this, then the doc that matches your job.

---

## Read this if you read nothing else

Six rules. Everything in `docs/` exists to serve them.

| # | Rule | Why |
|---|------|-----|
| 1 | A vehicle is bookable only if it's **named on the merchant's transport licence** | The licence (Form 2) lists registration numbers. Not on it = renting it is unlicensed. |
| 2 | A merchant needs **5+ compliant motorcycles** to be approved | Para 5(v) of the scheme. Not a guideline — a licensing precondition. |
| 3 | The **rental register is immutable and written at pickup** | It's a statutory record. It must survive the rider editing their profile or deleting their account. |
| 4 | **Never** hold customer money ourselves | RBI's 2025 PA Directions. A regulated payment aggregator holds it. We are a marketplace; a PA can't be one. |
| 5 | **Money is a ledger**, not a column | You will be asked to explain a ₹5,000 deposit that became a ₹3,200 refund. Rows, not mutations. |
| 6 | **No dark patterns** in the booking funnel | CCPA guidelines 2023 + June 2025 self-audit advisory. No "2 left!", no pre-ticked insurance, no drip pricing. |

**The test for "are we done":** reconstruct a finished booking end-to-end from the database alone. No screenshots, no frontend state, no one's memory.

---

## Which doc do I need

| I am… | Read |
|-------|------|
| building the backend | [`docs/backend.md`](docs/backend.md) — schema, routes, constraints, money logic |
| building the frontend | [`docs/frontend.md`](docs/frontend.md) — stack, routes, structure, conventions |
| picking up backend work phase-by-phase | [`docs/implementation.md`](docs/implementation.md) — exact build order and verification per phase |
| checking what's built vs. not, and what was fixed along the way | [`docs/progress.md`](docs/progress.md) |
| asking "why is it built this way" | [`docs/decisions.md`](docs/decisions.md) — every non-obvious decision, in sequence, with its reasoning |
| scoping the market / legality | [`docs/00-market.md`](docs/00-market.md) — sized, sourced, confidence-labelled |
| building the customer or merchant UI copy/flows | [`apps/Frontend/PRODUCT.md`](apps/Frontend/PRODUCT.md) — users, positioning, constraints, what's not offered |

---

## What it is, in one diagram

```
Customer  ──browse──▶  Vehicle (approved, on-licence, compliant)
   │
   ├─ hold (15 min, DB-enforced, no double booking)
   ├─ verify rider  ──▶ identity provider (store the result, not the document)
   ├─ pay           ──▶ payment aggregator (they hold the money, we hold references)
   │
   ▼
CONFIRMED ─▶ pickup inspection ─▶ ACTIVE ─▶ return inspection ─▶ settle deposit ─▶ COMPLETED
                    │                                  │
                    └── evidence ──────────────────────┴── damage claim ─▶ dispute ─▶ resolution
```

Every arrow writes an immutable event. Every rupee writes a ledger entry.

---

## Stack

As built, see `docs/backend.md` and `docs/frontend.md` for the full reasoning:

- **API** — Express on Bun, one process, three route trees (`/api/user`, `/api/merchant`, `/api/admin`) — a modular monolith, not microservices
- **DB** — PostgreSQL, `pg` (`Pool`), exclusion constraints for double-booking
- **No Redis** — rate limiting and holds are Postgres-backed; Bun's own `setInterval` sweeps expired holds
- **Storage** — Cloudflare R2 (S3-compatible), presigned URLs
- **Payments / KYC** — Cashfree (orders + Easy Split) and Cashfree Secure ID (DL + DigiLocker)
- **Tracking** — flespi, read-only passthrough, no telemetry stored
- **Frontend** — Bun + React 19 + wouter + react-query + Tailwind v4, one app serving all three surfaces (`docs/frontend.md`)
- **Monorepo** — Turborepo + bun

Every vendor integration has a dev-fallback so the whole app runs locally with no vendor
credentials — see `docs/decisions.md` (2026-10-03) and `docs/backend.md` "Provider dev-fallback".

---

## Repo layout

```
apps/Backend     Express API, Phases 1-17 built and tested — see docs/backend.md
apps/Frontend    React app, all three surfaces scaffolded — see docs/frontend.md
packages/        shared eslint config
docs/            backend.md, frontend.md, decisions.md, implementation.md, progress.md, 00-market.md
```

---

## Before you write code

Legal/commercial open questions (payment aggregator terms, GST SAC classification, deposit
release window, and others not yet resolved) are tracked in `docs/00-market.md` §9 and flagged
inline in `docs/backend.md`/`apps/Frontend/PRODUCT.md` wherever they block a specific decision.

Three of them change the schema. Don't skip that list.
