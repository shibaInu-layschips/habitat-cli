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

