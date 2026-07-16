# Task 3 review findings

## 2026-07-16

- Fixed `POST /clock/listen/on` so it validates the current persisted registration before any active-socket early return. An incomplete registration now returns `409` even when an older socket is still active.
- Added state API coverage for the stale-socket/incomplete-registration case.
- Added an explicit `/clock/watch` test proving it neither constructs a WebSocket nor calls upstream `fetch`.
- Reset stream constructor, active socket, notices, and persisted clock state in state API test teardown for lifecycle isolation.

Verification:

- `bun test tests/state-api.test.ts` — passed (24 tests, 111 expect calls)
- `bun run check` — passed
