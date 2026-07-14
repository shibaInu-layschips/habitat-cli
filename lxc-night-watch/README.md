# OpenClaw Night Watch

This project watches the OpenClaw solar irradiance feed and records every inspection in Markdown.

## Loop

1. Wake and run the Night Watch inspector.
2. Inspect `https://planet.turingguild.com/world/solar-irradiance`.
3. Decide whether the reading is `NORMAL`, `INCIDENT`, or `RECOVERED`.
4. Record the observation in `observations.md` and update `incidents.md`.
5. Report exactly one final response:
   - `NO_REPLY` when there is no alert-worthy state change
   - a concise Discord incident alert on the first transition into `INCIDENT`
   - a concise Discord recovery message on the transition into `RECOVERED`

## Files

- `ORDERS.md`: inspection instructions
- `observations.md`: append-only observation log
- `incidents.md`: one incident section per low-sunlight episode
- `night-watch.ts`: Night Watch logic
- `run.ts`: Bun entrypoint that prints the final response

## Run

```bash
bun lxc-night-watch/run.ts
```
