# Task 3 Report: Clock Hono routes and manual tick guard

## Implemented

- Added `GET /clock/status`.
- Added `POST /clock/listen/on` and `POST /clock/listen/off`.
- Added local-only `GET /clock/watch`, backed only by captured stream notices.
- Added typed `HabitatClockResponse` and `HabitatClockWatchResponse` client response types.
- Added a listening-mode guard before `/simulation/ticks` can parse or mutate simulation state.
- Listening mode is persisted before stream startup work. Incomplete saved registration stream data returns HTTP 409 with a clear error and restores safe manual mode.
- Existing Task 1 and Task 2 files and behavior were preserved.

## TDD evidence

Added failing tests first in `tests/state-api.test.ts` for clock status, listen-on, listen-off, watch, and tick rejection. The initial focused run failed with absent-route 404s and the unimplemented tick behavior. After implementation, the focused suite passed.

## Verification

```text
bun test tests/state-api.test.ts
22 pass
0 fail
106 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed

## Remaining Task 3 race fix

- `handleMessage` now captures the socket and registration generation before awaiting power simulation, then re-reads clock mode, registration validity/generation, and socket identity before committing the notice or connected state.
- A listening-off, unregistration, or socket replacement during the await closes/ignores the stale socket and commits neither stale notice nor clock connection state.
- Added a regression test that blocks tick simulation, turns listening off, resolves the simulation, and asserts no stale notice or connection state.
- Preserved concurrent tick deltas with an in-memory latest-observed tick while persistence remains post-await.

## Verification

```text
bun test tests/state-api.test.ts tests/kepler-stream.test.ts
35 pass
0 fail
135 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed
```

## Latest cancellation race verification

- Boundary regression: RED before the guard, GREEN after the guard.
- `HABITAT_BACKEND_RUNTIME=1 bun test tests/kepler-stream.test.ts tests/state-api.test.ts tests/power-simulation.test.ts`: 48 pass, 0 fail.
- `bun run check`: passed.

## In-flight simulation cancellation fix

- Added an `AbortController` for each stream tick run and passed its signal to `runPowerTicks`.
- `stopKeplerStream`, socket close/error/replacement, and invalid stream handling synchronously abort only runs owned by the affected socket.
- Added a real-runner regression with valid temporary battery/module state and 1,000,000 ticks; stopping during the yielded simulation leaves `simulation.currentTick`, battery state, and notices unchanged.
- Existing lifecycle guards and route behavior remain intact.

## Verification

```text
bun test tests/state-api.test.ts tests/kepler-stream.test.ts
37 pass
0 fail
146 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed
```

## Remaining cancellation race fix

- Added a regression test proving cancellation detected immediately before persistence leaves both module state and simulation state unchanged.
- Added `AbortError` checks immediately before `writeModuleState` and `writeSimulationState` in `runPowerTicks`.
- Preserved normal manual tick behavior when no signal is supplied.

## TDD evidence

- RED: the boundary regression returned normally and persisted state before the guards were added.
- GREEN: the same regression passed after the guards were added.

## Verification

The exact requested test command was also run and could not initialize the power-simulation tests because `http://localhost:28787` was not listening while the test environment selected remote module storage.

```text
bun test tests/kepler-stream.test.ts tests/state-api.test.ts tests/power-simulation.test.ts
38 pass
10 fail
```

With the repository's local-runtime setting:

```text
HABITAT_BACKEND_RUNTIME=1 bun test tests/kepler-stream.test.ts tests/state-api.test.ts tests/power-simulation.test.ts
48 pass
0 fail
189 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed
```

## Final verification for unregister race fix

TDD regression: the test failed before the change because the stream remained open and clock mode remained `listening` when remote DELETE started; it passes after stopping the stream and resetting the clock state first.

```text
bun test tests/state-api.test.ts tests/kepler-stream.test.ts
36 pass
0 fail
143 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed
```

## Remaining unregister race fix

- Added a regression test in `tests/state-api.test.ts` that starts a fake Kepler stream and asserts the socket is closed and persisted clock mode is `manual` before the remote unregister DELETE fetch begins.
- Updated `DELETE /registration` to stop the Kepler stream and reset persisted clock state to the manual default before awaiting `unregisterHabitat()`.
- Successful unregister cleanup and manual default behavior remain unchanged.

## TDD evidence

- RED: the new test failed because the DELETE fetch began with the stream still open and clock mode still listening.
- GREEN: the route ordering fix made the regression pass.

## Verification

```text
bun test tests/state-api.test.ts tests/kepler-stream.test.ts
36 pass
0 fail
143 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed
```
```

## Remaining stream-handler issue

- Added a regression test proving that a tick emitted by an already-open socket is ignored after the persisted clock mode changes to manual. The test asserts no clock-watch notice, no simulation tick mutation, and socket closure.
- Before applying any tick, the stream handler now re-reads clock state and registration. It closes and discards the socket when mode is no longer `listening` or stream URL, API token, Habitat ID, or stream metadata is incomplete.
- Valid listening-mode messages retain the existing notice and simulation behavior.

## Verification

```text
bun test tests/state-api.test.ts tests/kepler-stream.test.ts
34 pass
0 fail
132 expect() calls

bun run check
tsc --noEmit -p tsconfig.json && tsc --noEmit -p web/tsconfig.json
passed
```
