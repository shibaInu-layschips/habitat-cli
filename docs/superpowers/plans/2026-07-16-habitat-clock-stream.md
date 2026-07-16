# Habitat Clock Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted manual/listening clock control, one backend-owned Kepler stream connection, local watch/status API routes, and the exact clock CLI contract.

**Architecture:** Keep registration and clock state as SQLite JSON blobs. Add a focused stream lifecycle module owned by the Hono backend; it consumes the saved Habitat stream credentials and feeds the existing `runPowerTicks()` simulation path. The CLI calls only local Hono routes.

**Tech Stack:** Bun, TypeScript, Bun SQLite, Hono, Commander.js, Bun test.

## Global Constraints

- Manual mode is the default after registration and when clock state is absent or invalid.
- Listening mode rejects manual ticks before changing simulation state.
- The backend owns one Kepler WebSocket; CLI and browser never connect directly.
- `KEPLER_PLANET_TOKEN` is only for registration/planet HTTP authorization; the saved stream `apiToken` is only for the Habitat WebSocket.
- Never log tokens or full request/response bodies.
- Use Bun commands and preserve existing CLI behavior.

---

### Task 1: Registration stream data and persisted clock state

**Files:**
- Modify: `src/kepler-registration.ts`
- Create: `src/clock-state.ts`
- Modify: `src/state-api.ts`
- Test: `tests/kepler-registration.test.ts`, `tests/state-api.test.ts`

**Interfaces:**
- `KeplerRegistration` gains `streamUrl`, `apiToken`, and typed `stream` metadata.
- `readClockState(): ClockState`, `writeClockState(state: ClockState): void`, and `defaultClockState(): ClockState` are exported from `src/clock-state.ts`.

- [ ] Write a failing registration test using the supplied response shape and assert that all stream fields survive `registerHabitat()` and `readRegistration()`.
- [ ] Run `bun test tests/kepler-registration.test.ts` and confirm failure because stream fields are not yet normalized.
- [ ] Write a failing state API test asserting registration initializes `mode: "manual"` and returns stream metadata without substituting `KEPLER_PLANET_TOKEN` for the stream token.
- [ ] Run `bun test tests/state-api.test.ts` and confirm the expected contract failure.
- [ ] Add strict parsing for `streamUrl`, stream `apiToken`, and `stream` metadata while retaining legacy optional registration fields.
- [ ] Add `src/clock-state.ts` using the existing `readStateBlob` and `writeStateBlob` helpers, defaulting invalid/missing state to manual mode.
- [ ] Initialize or reset clock state to manual as part of successful registration and unregister cleanup.
- [ ] Update `/registration` responses and related client types to expose the saved stream fields.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Backend-owned stream lifecycle and watch notices

**Files:**
- Create: `src/kepler-stream.ts`
- Test: `tests/kepler-stream.test.ts`
- Modify: `src/server.ts`

**Interfaces:**
- `startKeplerStream(): Promise<void>` starts at most one connection.
- `stopKeplerStream(): Promise<void>` closes the active connection.
- `getClockWatchNotices(): ClockWatchNotice[]` returns local notices only.
- `isKeplerStreamActive(): boolean` reports ownership state.

- [ ] Write failing tests for one-connection ownership, `hello` authentication using the saved stream token, stop behavior, and local notice capture.
- [ ] Run `bun test tests/kepler-stream.test.ts` and confirm the missing-module failure.
- [ ] Implement the minimal WebSocket lifecycle with an injectable WebSocket constructor for deterministic Bun tests.
- [ ] Parse tick notices, calculate the represented tick count from the stream metadata, call `runPowerTicks()`, and update clock state/notice history.
- [ ] Record connecting, connected, disconnected, and error states without logging credentials.
- [ ] On backend startup, inspect persisted listening mode and attempt one stream start; leave manual mode disconnected.
- [ ] Run the stream tests and confirm they pass.

### Task 3: Clock Hono routes and manual tick guard

**Files:**
- Modify: `src/state-api.ts`
- Modify: `src/habitat-api-client.ts`
- Test: `tests/state-api.test.ts`

**Interfaces:**
- Add `GET /clock/status`, `POST /clock/listen/on`, `POST /clock/listen/off`, and `GET /clock/watch`.
- Add a reusable `isManualClockMode()`/guard path so `/simulation/ticks` rejects while listening.

- [ ] Write failing route tests for status, on, off, watch, and tick rejection with unchanged simulation state.
- [ ] Run the focused state API tests and verify the failures are caused by absent routes/guard behavior.
- [ ] Implement route handlers that persist mode before lifecycle work, return clear 409 errors when registration stream data is incomplete, and invoke the stream lifecycle functions.
- [ ] Make `/clock/watch` return only backend-captured notices and never call an upstream client constructor.
- [ ] Guard `/simulation/ticks` before `runPowerTicks()` when mode is listening.
- [ ] Run `bun test tests/state-api.test.ts` and confirm all route tests pass.

### Task 4: Exact CLI clock command wiring

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/habitat-api-client.ts`
- Test: `tests/cli.test.ts`

- [ ] Write failing CLI tests for `clock status`, `clock listen on`, `clock listen off`, `clock watch`, and manual tick rejection.
- [ ] Run the focused CLI tests and confirm Commander does not yet recognize the clock command.
- [ ] Add the nested Commander command shape exactly as requested and print concise mode/stream/watch output.
- [ ] Keep `habitat tick <count>` intact while surfacing the backend’s listening-mode rejection.
- [ ] Run `bun test tests/cli.test.ts` and confirm the CLI tests pass.

### Task 5: Full verification and cleanup

**Files:**
- Modify: `tests/*` only where regressions require updates.
- Modify: `docs/superpowers/specs/2026-07-16-habitat-clock-stream-design.md` only if implementation decisions materially change.

- [ ] Run `bun run check`.
- [ ] Run `bun test`.
- [ ] Inspect `git diff --check` and confirm no token-bearing logs or accidental runtime files are included.
- [ ] Review the requirement checklist: default off, persisted mode, one backend connection, stream ticks applied, manual ticks rejected while listening, watch uses local API, and exact CLI commands.
- [ ] Attempt a focused commit; if Git remains unavailable because `.git/index.lock` is denied, report that exact blocker without claiming a commit was created.
