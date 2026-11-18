# RetroMobi mobile

Two Expo apps call the same RetroMobi backend as the website. Run `bun install` in this folder; it is a separate workspace.

- `user/` — RetroMobi, for finding a scooter, booking it and managing the ride.
- `merchant/` — RetroMobi for Shops, for bookings, fleet, staff, support and earnings.
- `shared/` — session storage, API calls, dates, money, language, and common UI.

Each app puts its routes in `src/app/`; feature code lives in `src/features/` and app state in `src/state/`. The shared client uses the app's API address, stores account credentials in SecureStore and refreshes the access token once for concurrent requests. TanStack Query keeps server data in memory; the rider cart and selected merchant branch keep only non-secret state on the device.

Set the public API address and provider IDs using each app's `.env.example`. Use HTTPS for production. Public environment variables are included in the app bundle. Camera, microphone and location are requested when the associated feature is used; denied permissions offer alternatives. The apps depend on native modules, so Expo Go cannot run them.

For the owner's first Android test, enter `user/` or `merchant/` and run `bunx expo run:android`, or use `eas build --profile development`, then `bunx expo start --dev-client`. Rebuild after adding a native package or changing native configuration. A preview build is for internal testing; the production profiles are for store release. There is no store deployment or EAS Update setup in this handoff.

[Progress and first device test](./PROGRESS.md) tracks what was checked and what needs credentials or device testing. See `docs/mobile-apps-handoff.md` for feature requirements.
