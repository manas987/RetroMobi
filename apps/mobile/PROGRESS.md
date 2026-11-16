# RetroMobi mobile progress

## Merchant

| Feature | Status | Date | Notes |
|---|---|---|---|
| M1 Sign in | checks pass | 2026-11-15 | Existing sign-in; no device run. |
| M2 Shell, shop switcher, roles | checks pass | 2026-11-15 | Merchant shell phase; no device run. |
| M3 First shop + invites for you | checks pass | 2026-11-15 | Merchant shell phase; no device run. |
| M4 Home | checks pass | 2026-11-15 | Merchant Home and counter actions; no device run. |
| M5 Bookings list | checks pass | 2026-11-15 | Merchant Bookings; no device run. |
| M6 Bookings calendar | checks pass | 2026-11-15 | Merchant Bookings; no device run. |
| M7 Booking detail | checks pass | 2026-11-15 | Merchant Bookings; no device run. |
| M8 Hand over (online): ID check | checks pass | 2026-11-15 | Merchant Home and counter actions; no device run. |
| M9 Hand over (walk-in) | checks pass | 2026-11-15 | Merchant Home and counter actions; no device run. |
| M10 Return + deposit claim | checks pass | 2026-11-15 | Merchant Home and counter actions; no device run. |
| M11 Walk-in booking | checks pass | 2026-11-15 | Merchant Home and counter actions; no device run. |
| M12 Vehicles list | checks pass | 2026-11-15 | Vehicle management phase; no device or storage-provider run. |
| M13 Vehicles timeline | checks pass | 2026-11-15 | Fleet calendar and listing board; no device run. |
| M14 Get-listed board | checks pass | 2026-11-15 | Fleet calendar and listing board; no device run. |
| M15 Add vehicle | checks pass | 2026-11-15 | Vehicle management phase; no device or storage-provider run. |
| M16 Vehicle page, 7 tabs | checks pass | 2026-11-15 | Vehicle management phase; no device or storage-provider run. |
| M17 Get-listed wizard | checks pass | 2026-11-15 | Branches and guided shop setup; no native or storage run. |
| M18 Shop details, photos, hours | checks pass | 2026-11-15 | Branches and guided shop setup; no native or storage run. |
| M19 Shop papers | checks pass | 2026-11-15 | Branches and guided shop setup; no native or storage run. |
| M20 Branches | checks pass | 2026-11-15 | Branches and guided shop setup; no native or storage run. |
| M21 Licence & papers | checks pass | 2026-11-15 | Branches and guided shop setup; no native or storage run. |
| M22 All vehicles + move | checks pass | 2026-11-15 | Merchant branch operations; no device run. |
| M23 Staff | checks pass | 2026-11-15 | Merchant branch operations; no device run. |
| M24 Activity log | checks pass | 2026-11-15 | Merchant branch operations; no device run. |
| M25 Help & chats | checks pass | 2026-11-15 | Chats and money screens; no device run. |
| M26 Earnings + bank account | checks pass | 2026-11-15 | Chats and money screens; no device run. |
| M27 Reports | checks pass | 2026-11-15 | Chats and money screens; no device run. |
| M28 Language switch | checks pass | 2026-11-15 | Merchant shell phase; no device run. |
| M29 Sign out, user chip | checks pass | 2026-11-15 | Merchant shell phase; no device run. |

## Rider

| Feature | Status | Date | Notes |
|---|---|---|---|
| R1 Home / search entry | checks pass | 2026-11-15 | Explore with city/date search, steps and FAQs. |
| R2 Results list | checks pass | 2026-11-15 | Rider discovery and persisted cart UI; no device run. |
| R3 Filters | checks pass | 2026-11-15 | Rider discovery and persisted cart UI; no device run. |
| R4 Map of results | checks pass | 2026-11-15 | Rider discovery and persisted cart UI; no device run. |
| R5 Vehicle page | checks pass | 2026-11-15 | Rider discovery and persisted cart UI; no device run. |
| R6 Shop page | checks pass | 2026-11-15 | Rider discovery and persisted cart UI; no device run. |
| R7 Cart | checks pass | 2026-11-15 | Rider discovery and persisted cart UI; no device run. |
| R8 Checkout | checks pass | 2026-11-15 | Hold and rider management wired; no device run. |
| R9 Pay | written | 2026-11-15 | Cashfree 3.0, server confirmation, hold timer and recovery. Expo Doctor flags untested New Architecture metadata; native sandbox test pending. |
| R10 Sign in / sign up | checks pass | 2026-11-15 | Phone/email OTP and Google path. Real sign-in unverified. |
| R11 My bookings | written | 2026-11-15 | Holds resume, cancellation and extension; interrupted native extension payment needs Q3. |
| R12 Pickup video | written | 2026-11-15 | Camera/gallery, preview and upload progress; storage and camera untested on device. |
| R13 Riders & profile | checks pass | 2026-11-15 | Hold and rider management wired; no device run. |
| R14 Licence check | checks pass | 2026-11-15 | Consent, resume, DigiLocker, licence number and photo paths; no device run. |
| R15 Support | written | 2026-11-15 | Search, ticket creation, chat, attachment retry/download and resolution; native file flow unverified. |
| R16 Reviews | written | 2026-11-15 | Ride eligibility, post, edit, delete, and conflict recovery. |
| R17 Account menu, sign out | checks pass | 2026-11-15 | Hold and rider management wired; no device run. |
| R18 Statutory links | written | 2026-11-15 | Cancellation policy and required headings. Owner must supply the missing publication text and grievance details. |

## Shared work

Rider phase U10 — **written**, 2026-11-16. Added unsaved-changes protection, attachment recovery, safer pickup upload cancellation, rate-limit messaging, location permission recovery, and payment haptics. Individual TypeScript and lint checks passed; 89 shared and 3 rider tests passed. Android and iOS JavaScript exports passed for both apps. Merchant Expo Doctor passed 20/20; rider 19/20 (Cashfree SDK is marked untested with the New Architecture). No native build, simulator, phone or live provider test was run.

Rider phases U7–U9 — **written**, 2026-11-15. TypeScript, lint, tests and Android exports passed; the rider Expo Doctor check remains at 19/20 because of the Cashfree compatibility warning.

Rider phase U5 — **checks pass**, 2026-11-15. Rider/profile management, distinct rider assignment, checkout hold, and server status screen. Native payment follows in U7.

Rider phase U4 — **checks pass**, 2026-11-15. Five-step sign-in/sign-up modal. Google uses the backend web audience; iOS Google is hidden unless an iOS OAuth client is provided.

Rider phase U2 — **checks pass**, 2026-11-15. Anonymous browse, filters, Mapbox, vehicle/shop detail, and cart. Rider phase U3 is owner-run (see below).

Rider phase U1 — **checks pass**, 2026-11-15. Explore starts blank and routes a completed search to Browse. Stock photos copied from the web for U2.

Merchant phase M9 — **checks pass** for code, 2026-11-15. Offline state, safer session scope, 429 polling delay, localized close labels and wrapping controls. Interactive Hindi, 1.6× type, TalkBack/VoiceOver, keyboard and Android back-button checks remain device work.

Merchant phase M8 — **checks pass**, 2026-11-15. Chat list, incremental conversation polling, new chats, attachments, payout list, bank form and reports by shop/all shops.

Merchant phase M7 — **checks pass**, 2026-11-15. All-branch vehicle list and moves, staff/invites, role controls and paginated activity log.

Merchant phase M6 — **checks pass**, 2026-11-15. Shop details, hours, photos and GPS/map pin; branches, licence, shop/business papers, bank form and five-step verification guide. Android bundles and Expo Doctor pass. Native development build and R2 still need testing.

Merchant phase M5 — **checks pass**, 2026-11-15. Horizontally scrolling 14/30-day fleet calendar with vehicle names pinned; five-stage listing board and submission. Guided shop setup follows in M6.

Merchant phase M4 — **checks pass**, 2026-11-15. Fleet list, add vehicle, listing switches, and seven management tabs. Camera and file writes need native and R2 verification.

Merchant phase M3 — **checks pass**, 2026-11-15. Searchable booking list, stage tabs, filters, month calendar, and deep-linkable detail. Vehicle and Help links will connect in M4 and M8 respectively. Both Android exports passed; shared tests 86/86.

Merchant phase M2 — **checks pass**, 2026-11-15. Home, today and upcoming, attention, real fleet availability, 7-day chart, reviews, walk-ins, handover and return. Destination links are added with their screens. Both app bundles passed; shared tests 86/86.

Merchant phase M1 — **checks pass**, 2026-11-15. Home and More are available; task tabs will be added with their screens, without placeholder links.

Phase S — **checks pass**, 2026-11-15. Pickers, persisted rider cart, and selected merchant shop. Shared tests: 84/84. Both apps: TypeScript, lint, Expo Doctor (20/20), and Android bundle export.

## Open questions

- **Extension payment (Q3):** confirmed in `apps/Backend/src/Routes/user/Bookings/bookingsService.ts`: creating an extension returns `orderId`, but resuming an active one returns only `state`, `paymentSessionId`, and `mode`. The mobile SDK needs the order ID; the resume branch needs to expose it before this can be ported. Backend left unchanged.
- **Merchant attachments:** the merchant API accepts uploads and returns attachment names, but has no authorized download route. Names are shown without a download action. The rider API does have a download route.
- See section 13 of the handoff for the native payment return URL, Google sign-in on a real build, and Android API URL.

## Owner steps waiting

Merchant app now includes Mapbox and location; it requires a development build. From `apps/mobile/merchant`, the owner can run `bunx expo run:android` or `eas build --profile development`, then `bunx expo start --dev-client`. The rider app now also requires a development build: from `apps/mobile/user`, run `bunx expo run:android` or `eas build --profile development`, then `bunx expo start --dev-client`. Rebuild after adding Google or payment support. For Google: register the Android signing SHA with the matching Android app ID; for iOS Google sign-in, set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` to the real iOS OAuth client ID. Native development builds and phone verification are owner-run. See sections 11–12 of the handoff for configuration and sandbox credentials.

### First device pass

1. **Merchant:** sign in as an owner and as staff. Create a walk-in, hand over, return, and check the activity log. Try Hindi and 1.6× system text, Android Back, and TalkBack/VoiceOver. Test a cancelled camera prompt, a revoked location permission and offline recovery. Confirm bank/earnings and staff actions appear for the right roles.
2. **Rider:** browse signed out, add a vehicle, sign in, verify a licence, and make a new booking. During payment, background or kill the app and recover the hold from Bookings. Test both approved and failed payments on Cashfree sandbox, including the configured return URL. Record and preview a pickup video, then try a failed upload followed by retry. Walk through extension, return, a support attachment, and a review.
3. **Before store upload:** use the HTTPS production API, confirm app IDs and signing, review permissions and artwork, run native builds for the platforms being released, and supply the outstanding policy content and verify font redistribution rights. Keep Cashfree, Secure ID, and R2 secrets on the backend.
