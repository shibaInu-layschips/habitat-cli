# Kepler Registration Design

## Goal

Add Kepler registration support to the existing Habitat CLI with these commands:

- `habitat register --name "<habitat name>"`
- `habitat status`
- `habitat unregister`

`habitat status` must keep its current habitat summary and also show registration state.

## Approach

Keep the existing multi-object CLI in place and layer registration support onto it. Store registration state in `.habitat/registration.json` so it lives beside the existing `.habitat/data.json` file without disturbing the current local habitat objects.

The Kepler integration will be implemented in a dedicated module that:

- reads `KEPLER_BASE_URL` and `KEPLER_PLANET_TOKEN`
- performs registration and unregistration HTTP requests
- normalizes the response into a small local registration record
- exposes read helpers so `habitat status` can show registration details

## Data

Persist a local registration record with:

- `habitatName`
- `registeredAt`
- `registrationId` when available
- `habitatId` when available
- `status`
- `registerUrl`
- `unregisterUrl` when available
- `raw` response payload for inspection/debugging

## Error Handling

- If env vars are missing, registration commands should fail with clear instructions.
- If the user tries to unregister without a local registration record, show a friendly message.
- If the API response shape varies, preserve the raw payload and best-effort extracted ids/status.

## Verification

- Typecheck with `bun run check`
- Inspect help output
- Run `habitat status`
- Run `habitat register --name "Apollo 2.0"` once env values are set
- Run `habitat unregister`
