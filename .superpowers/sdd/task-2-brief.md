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

