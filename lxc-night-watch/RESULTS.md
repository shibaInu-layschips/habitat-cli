# Night Watch Results

## Observed Values

- Deployed commit hash: not captured in retained local evidence for this run
- Baseline irradiance: not captured in retained local evidence for this run
- Lowest irradiance: not captured in retained local evidence for this run
- Incident start time: not captured in retained local evidence for this run
- Recovery time: not captured in retained local evidence for this run
- Final status: not captured in retained local evidence for this run
- Exactly one incident alert and one recovery message appeared in Discord: not confirmed from retained local evidence for this run

## How The Pieces Worked Together

The GitHub repository stored the Night Watch implementation, instructions, and Markdown evidence files. The `lxc-night-watch` directory contained the run entrypoint, inspection logic, operator orders, and the `observations.md` and `incidents.md` files that the inspector updates on each pass.

The OpenClaw Gateway acted as the execution surface that ran the Night Watch inspector on a schedule. Each scheduled run invoked the Night Watch entrypoint, which fetched the latest solar irradiance reading, classified the state, updated the Markdown files, and produced one final outbound response for that run.

The cron scheduler provided the repeat timing for the inspector. Its job was to wake the Night Watch process at the configured interval so the inspection loop could happen without manual intervention.

The Kepler endpoint provided the live solar irradiance data source. Night Watch queried the solar irradiance endpoint, read `solarIrradiance.wPerM2` and `solarIrradiance.condition`, and used the threshold rules in `ORDERS.md` to decide whether the reading was `NORMAL`, `INCIDENT`, or `RECOVERED`.

The observation files preserved the run history locally in Markdown. `observations.md` served as the append-only inspection log, while `incidents.md` tracked one incident record per low-irradiance episode so the system could avoid duplicate incident creation and detect recovery cleanly.

Discord delivery was the outbound notification layer. Night Watch returned `NO_REPLY` when there was no alert-worthy state change, sent one incident alert on the first transition into `INCIDENT`, and sent one recovery message on the transition into `RECOVERED`.

## Notes

This summary intentionally excludes tokens, device codes, credentials, private IP addresses, and Discord IDs.
