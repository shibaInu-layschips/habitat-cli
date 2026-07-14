# Orders

For each inspection:

1. Query `https://planet.turingguild.com/world/solar-irradiance`.
2. Read `solarIrradiance.wPerM2` and `solarIrradiance.condition` from the JSON response.
3. Classify the reading with these rules:
   - `NORMAL`: `wPerM2` is 450 or greater and there is no open incident
   - `INCIDENT`: `wPerM2` is below 450
   - `RECOVERED`: `wPerM2` returns to 450 or greater after an incident
4. Append the timestamp, `wPerM2`, `condition`, classification, and a short note to `observations.md`.
5. Use `incidents.md` to keep one incident per low-sunlight episode:
   - Create an incident when the reading first crosses below 450.
   - While it remains below 450, update the same incident instead of creating duplicates.
   - When it returns to 450 or greater, add the recovery time and mark that incident recovered.
6. Compare the new classification with the most recent observation and produce the final response:
   - `NORMAL` with no state change: return exactly `NO_REPLY`
   - first transition into `INCIDENT`: return one concise Discord alert with the timestamp and `wPerM2` reading
   - continued `INCIDENT` with no state change: return exactly `NO_REPLY`
   - transition from `INCIDENT` to `RECOVERED`: return one concise Discord recovery message with the timestamp and `wPerM2` reading
   - continued normal operation after recovery: return exactly `NO_REPLY`
