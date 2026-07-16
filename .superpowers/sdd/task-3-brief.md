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

