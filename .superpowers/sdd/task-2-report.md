# Task 2 report

## Status

Implemented Task 2. Task 1 changes were preserved; no unrelated files were reverted.

## Files

- `src/kepler-stream.ts`: backend-owned single WebSocket lifecycle, injectable constructor, saved Habitat stream-token authentication, tick notice parsing, power-tick dispatch, clock-state updates, and local notice history.
- `tests/kepler-stream.test.ts`: deterministic tests for one active connection, `hello` authentication, stop behavior, and local notice capture.
- `src/server.ts`: restores listening mode on backend startup and leaves manual mode disconnected.

## Verification

- `bun test tests/kepler-stream.test.ts` — passed: 2 tests, 6 expectations.
- `bun run check` — passed for both TypeScript projects.
- `bun test` — 99 passed, 9 failed.
- `git diff --check` — passed.

## Concern

The 9 full-suite failures are in existing `power-simulation` tests, where local module persistence is routed to `http://localhost:28787/modules` and no Habitat API is listening. The failures are environment/API reachability errors, not stream-test failures. The focused stream suite passes independently.

No commit was created.

## Fix Review

### Findings fixed

- Concurrent `startKeplerStream()` calls now share one in-flight startup promise, so only one socket can be created.
- Tick deltas now use the latest received Kepler tick; notices 15 then 20 apply 5 then 5.
- A tick notice is verified to advance the real local simulation through `runPowerTicks` using temporary battery/module state.
- Startup normalizes persisted manual mode to disconnected and does not reopen the stream.
- Startup and socket-error handling release active ownership so a later startup can recover.

### Verification commands and output

```text
$ bun test tests/kepler-stream.test.ts
7 pass
0 fail
12 expect() calls

$ bun run check
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
```

Tests were written first and the new concurrency/delta/simulation/manual-mode tests were observed failing before the implementation changes. No commit was created.

## Remaining review findings

- Added `normalizeClockStateForStartup()` and called it from the real `src/server.ts` startup path, so persisted manual mode is explicitly written as `streamStatus: "disconnected"` before deciding whether to restore the Kepler stream.
- On socket error, `kepler-stream.ts` closes that exact socket. Close/error handlers only mutate state while they still own the current socket, preserving the at-most-one-live-socket recovery invariant.
- Added regression coverage for real startup normalization and stale failed-socket events.

### Final verification

```text
$ bun test tests/kepler-stream.test.ts
9 pass
0 fail
17 expect() calls

$ bun run check
$ tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
```

The regression suite was observed red before implementation because the startup normalization helper did not yet exist. No commit was created.
