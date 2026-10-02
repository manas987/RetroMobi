# RetroMobi

Scooter rental marketplace for India. Customers rent a specific scooter from a licensed merchant for a time window.

**Status:** planning. No code yet. Read this, then the doc that matches your job.

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
| building the backend | [`docs/03-architecture.md`](docs/03-architecture.md) — schema, routes, constraints |
| building the customer or merchant UI | [`docs/01-product.md`](docs/01-product.md) — flows, screens, states |
| worried about legality | [`docs/02-legal.md`](docs/02-legal.md) — verified sources, what's settled, what isn't |
| deciding what to build first | [`docs/04-build-plan.md`](docs/04-build-plan.md) — phases + acceptance tests |
| a founder / PM | this page, then [`docs/02-legal.md`](docs/02-legal.md) §Open questions |

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

Decided, per the spec:

- **API** — Fastify / Node 24, modular monolith (not microservices)
- **DB** — PostgreSQL + PostGIS
- **Cache/locks** — Redis (never the source of truth for a booking or a rupee)
- **Storage** — private object storage, signed URLs
- **Monorepo** — Turborepo + bun

Not decided: payment aggregator, KYC provider, tracker vendor, frontend framework. See [`docs/04-build-plan.md`](docs/04-build-plan.md) §Blocked on.

---

## Repo layout

```
apps/Backend     Fastify API            (empty — phase 1)
apps/Frontend    deliberately empty     (three surfaces, decide later)
packages/        shared types, config   (empty)
docs/            this plan
```

`apps/Frontend` stays empty on purpose. The product needs three surfaces — customer mobile, merchant web, admin web — and that's not one app. Decide when there's an API to call.

---

## Before you write code

Eleven things need a human answer, six of them from a lawyer or a CA. They're listed in [`docs/02-legal.md`](docs/02-legal.md) §Open questions and [`docs/04-build-plan.md`](docs/04-build-plan.md) §Blocked on.

Three of them change the schema. Don't skip that list.
