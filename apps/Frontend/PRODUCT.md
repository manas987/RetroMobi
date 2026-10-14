# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the rider.** A domestic Indian tourist or local resident in Uttarakhand who wants a
scooter for one to ten days. Typically on a mid-range Android phone, outdoors in hill daylight with
glare, on patchy or metered mobile data, often standing in the town they are renting in. Pilgrimage
and tourist traffic dominates (Haridwar alone sees crore-scale annual footfall), so a large share of
visitors are first-time users who will never return to the site twice in a year.

Merchants (shop owners and their staff) and admins are real actors in the system but operate through
separate surfaces that are out of scope for this app.

## Product Purpose

A marketplace that lets a rider find a specific scooter from a licensed merchant for a specific time
window, book it, and pay — without creating an account to browse. Success is a completed booking
that the rider collects, and a deposit that comes back.

Launch geography is decided: **Uttarakhand**, starting with Dehradun, Haridwar and Rishikesh.

## Positioning

Legality is the differentiator a neighbouring product cannot truthfully copy. A vehicle may only be
rented when its registration number is named on the merchant's Rent-a-Motorcycle licence. RetroMobi
gates listings on that licence membership and states, per vehicle, which authority licensed it.

The second differentiator is the timestamped pre-ride condition record — the documented answer to
the market's dominant advice, which is to *not* pre-book online and instead walk up and inspect the
scooter in person.

RetroMobi is an e-commerce marketplace entity, not the supplier. Merchants hold the security
deposit; the platform adjudicates and evidences disputes, and does not indemnify.

## Operating Context

The rider's flow: search a city and date window → compare scooters and shops → book → verify their
driving licence → pay → collect in person at the shop → record the scooter's condition on video →
ride → return → deposit released by the shop.

Pricing is per **IST calendar day**, with separate weekday and weekend rates and optional seasonal
overrides. No minimum duration; **maximum ten days**. All prices are tax-inclusive — GST is
extracted from the listed price, never added on top. All amounts are integer paise. The client never
sends an amount; the server's snapshot is authoritative.

Deposits are held by the merchant, capped at ₹10,000 (the UPI Reserve Pay block limit), refundable
and never taxed.

## Capabilities and Constraints

Built and callable today: phone-OTP auth (no passwords), availability-aware search grouped by
scooter model, rider management, driving-licence verification via Cashfree Secure ID and DigiLocker,
booking holds (10 minutes), Cashfree payments, pickup video upload, support tickets, shop-level
reviews.

Hard constraints:

- A booking requires each rider to hold a **verified driving licence covering the whole window**.
- Double-booking is prevented by a database exclusion constraint, so a booking can fail at the last moment and the UI must handle it.
- Up to **five vehicles** per checkout, each bound to its own distinct verified rider.
- Reviews are **shop-level**, not per-vehicle, and may only be written after collection.
- Cancellation: >24h → 90% refunded · 2–24h → 50% · <2h or after pickup → 0%. The deposit always returns in full; the platform fee and the GST within it are never refunded.

Explicitly undecided, and not to be invented:

- The deposit release window (how long after return the shop must release it).
- The GST SAC classification. The rate must vary by propulsion and engine capacity; it is currently a single flat constant, which is a known defect.
- Whether a monthly plan exists — the ten-day cap currently forecloses it.

Not offered at MVP, and not to be implied: damage waiver or add-on insurance, doorstep delivery,
cross-branch one-way return, inter-state riding, foreign and NRI riders, peer-to-peer listings,
dynamic pricing.

## Brand Commitments

Name: **RetroMobi**. No logo, wordmark, palette or typeface exists yet.

Binding visual constraints the user has pinned: Apple-grade restraint, glassmorphism used
deliberately, a green realistic Earth map as a core part of vehicle discovery, and an amber accent
carried from the user's reference images.

Voice: plain and specific. Controls name their action; errors name the problem and the recovery.

## Evidence on Hand

Real: the product, market, legal and architecture documents in `docs/`, including field-verified
competitor behaviour and statutory analysis. A working backend with dev-fallback stubs for every
third-party provider, so the entire funnel is walkable locally with no vendor credentials.

**Absent, and never to be fabricated:** customer testimonials, ratings, review counts, booking
volumes, merchant names, scooter photography, press, partnerships, and any claim about a deposit
guarantee. At launch nearly every shop will have **zero** reviews — that is the default state, not
an edge case.

The word "guarantee" must not appear on any customer surface: there is no claim path, no reserve and
no published terms behind it.

## Product Principles

1. **Browsing is anonymous.** Nothing before the booking action asks who the rider is.
2. **State the price completely and state who holds the money.** The deposit is the most-disputed number in the category; it is disclosed with its amount, its holder, and its return condition together.
3. **Licensing is a gate, not a label.** A scooter that cannot lawfully be rented does not appear.
4. **Verification is an asset, not a toll booth.** A rider verifies once and is verified thereafter.
5. **Never manufacture urgency.** The only countdown that exists is the real ten-minute hold.

## Accessibility & Inclusion

**WCAG 2.1 AA is a legal duty**, not a quality target (IT Rules r.3(1)(m)).

Statutory publications — grievance officer, National Consumer Helpline, privacy notice, user
agreement, cancellation policy and ranking parameters — must be reachable from the home screen or
one tap from it.

Legal pages and eligibility or refusal messages must be publishable in **Hindi** alongside English:
rule 3(1)(a) permits an Eighth Schedule language of the user's choice, and this is pilgrimage
traffic. Any typeface chosen must therefore carry Devanagari.

Outdoor daylight use raises the practical contrast floor above the statutory minimum for price and
primary-action elements.
