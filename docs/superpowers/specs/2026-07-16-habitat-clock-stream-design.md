# Habitat Clock Stream Design

## Goal

Add the student-facing clock contract:

```text
habitat clock status
habitat clock listen on
habitat clock listen off
habitat tick <count>
habitat clock watch
```

Manual simulation is the default. When listening is enabled, Kepler tick notices drive the local simulation and manual ticks are rejected.

## Architecture

The Hono backend owns the single Kepler WebSocket connection. The CLI and browser communicate only with the local Habitat API. This keeps the long-lived connection, reconnect behavior, tick application, and credentials out of short-lived clients.

The stream client will be a focused module, `src/kepler-stream.ts`, with lifecycle operations for starting and stopping the connection and a local notice buffer for `clock watch`. It will read `streamUrl`, Habitat `apiToken`, and `habitatId` from saved registration state. It will authenticate the WebSocket with a stream `hello` message and never use `KEPLER_PLANET_TOKEN` as the Habitat stream credential.

## Persisted state

SQLite remains the local source of truth in `habitat.sqlite`. Registration state will preserve the Kepler response fields:

- `habitatId`
- `streamUrl`
- Habitat-specific `apiToken`
- `stream` metadata, including protocol version, subscriptions, current tick, ticks per pulse, and status

Clock state will be stored in a separate `clock` state blob so registration data and runtime mode remain distinct:

```ts
type ClockMode = "manual" | "listening";

type ClockState = {
  mode: ClockMode;
  streamStatus: "disconnected" | "connecting" | "connected" | "error";
  lastKeplerTick: number | null;
  lastTickAt: string | null;
};
```

New registrations initialize clock mode to `manual`. Reading an absent or invalid clock blob also resolves safely to manual mode. The selected mode is written before the backend attempts to connect, so it survives a process or systemd restart.

## Local API

Add these Hono routes:

```text
GET  /clock/status
POST /clock/listen/on
POST /clock/listen/off
GET  /clock/watch
```

`GET /clock/status` returns persisted mode, stream status, last received tick, and the saved stream metadata needed for diagnosis.

`POST /clock/listen/on` persists listening mode and starts the backend-owned stream. If no complete stream registration exists, it returns a clear conflict/error without pretending that listening is active.

`POST /clock/listen/off` persists manual mode, stops the WebSocket, and prevents future Kepler ticks from being applied.

`GET /clock/watch` returns recent notices already observed by the backend. It must not open a new upstream connection.

## Tick behavior

The existing `runPowerTicks()` remains the shared simulation operation. Manual CLI ticks call it directly only when clock mode is `manual`. Incoming Kepler tick notices call the same operation with the number of ticks represented by the notice, while updating clock metadata and the local tick observation.

When mode is `listening`, `POST /simulation/ticks` and `habitat tick <count>` reject before simulation state changes. The error should explain that manual ticks are disabled while clock listening is on.

## CLI output

`habitat clock status` displays mode, connection status, last Kepler tick, and stream metadata. `habitat clock listen on/off` reports the resulting mode and connection state. `habitat clock watch` displays locally observed future/current notices and identifies that they came through the local Habitat API.

The full saved stream API token may be shown by `habitat clock status` because this is an explicit local diagnostic command, but tokens must not appear in backend logs, errors, or upstream request logging.

## Error handling and restart behavior

- Registration response parsing validates the stream URL, stream token, and stream metadata independently of optional legacy fields.
- A failed connection records `streamStatus: "error"` and keeps the selected mode persisted.
- Turning listening off always closes the active connection and changes mode to manual.
- On backend startup, persisted listening mode is restored and the stream client attempts to reconnect using saved registration state.
- Reconnect attempts must not create more than one active WebSocket.

## Tests

Add focused tests covering:

1. registration persistence of `streamUrl`, stream token, and stream metadata;
2. default manual mode after registration;
3. persisted mode surviving a fresh state read;
4. listen-on and listen-off lifecycle behavior;
5. rejection of manual ticks while listening;
6. application of an observed Kepler tick through the existing simulation path;
7. `clock watch` reading local notices without invoking a second upstream connection;
8. CLI command wiring and user-facing output.

Verification remains `bun run check` followed by `bun test`.
