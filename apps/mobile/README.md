# RetroMobi mobile

Two Expo apps and their shared code. Its own bun workspace: run `bun install` **here**, not at the repo root.

- `user/` — RetroMobi (riders)
- `merchant/` — RetroMobi for Shops
- `shared/` — `@retromobi/mobile-shared`

Build instructions, rules and the feature list: `docs/mobile-apps-handoff.md`.

To run (owner): copy `user/.env.example` to `user/.env`, set the API address, then `cd user && bunx expo start`. Same for `merchant`.
