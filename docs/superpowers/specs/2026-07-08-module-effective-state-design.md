# Module Effective State Design

## Goal

Improve module reporting so the CLI shows both the stored declared state and the locally derived effective state.

This design covers:

- `habitat module status` showing declared state and effective state for every module
- `habitat module show <module-id>` showing richer module-specific details
- clearer battery-related messages when there is no usable battery energy

This design does not change how module state is stored on disk.

## Approach

Keep `runtimeAttributes.status` as the declared state and compute an effective state only at display time.

The effective state should reflect local conditions that matter to the user right now:

- a workshop fabricator with an active construction job is effectively `busy`
- a battery with zero usable energy is effectively `depleted`
- a module with declared `offline` remains effectively `offline`
- all other modules default to their declared state

This keeps local persistence simple while making the CLI more honest about current behavior.

## Reporting

### `habitat module status`

Render a table with these columns:

- `Module`
- `Declared State`
- `Effective State`
- `Power Draw (kW)`
- `Reason`

The `Reason` column should always be shown:

- when declared and effective state differ, explain why
- otherwise show a simple readiness label such as `ready`

Examples:

- `workshop-fabricator-1 | active | busy | 4 | active construction job`
- `basic-battery-1 | active | depleted | 0 | no usable battery energy`

### `habitat module show <module-id>`

Keep `show` as the full-detail module command.

Every module should show:

- module slug
- module id
- blueprint id
- display name
- declared state
- effective state
- condition
- capabilities
- connected modules

Then add module-specific sections when relevant.

For a workshop fabricator:

- show the active construction job if one exists
- include job id, blueprint id, output module type, remaining build ticks, and spent resources

For a battery:

- show current energy
- show storage capacity
- show reserve
- show max power output
- show whether energy is currently usable

For finished constructed modules such as `small-solar-array-1`:

- show useful runtime attributes in a readable table instead of raw JSON

## Battery Messaging

When power is blocked because the battery exists but cannot provide usable energy, use clearer messages.

Preferred message shape:

- headline: `No usable battery energy is available.`
- detail: identify the battery, its declared state, and its current energy
- consequence: explain that construction or other activity cannot continue until usable energy is available

Example:

- `No usable battery energy is available.`
- `basic-battery-1 is active, but current energy is 0 kWh.`
- `Construction cannot start until the battery has usable energy.`

## Data And Boundaries

- Persisted module state remains in `.habitat/modules.json`
- Construction job state remains in `.habitat/construction.json`
- Effective state is derived from existing local module state plus active construction jobs
- No new persisted status field is added

## Error Handling

- If a module has no active construction job, the fabricator details section should say so clearly instead of failing
- If a battery lacks expected numeric runtime attributes, fall back to `0`-style values rather than crashing the command
- If a module has no special section, still show the standard module details cleanly

## Verification

- Typecheck with `bun run check`
- Run `bun test`
- Run `habitat module status`
- Run `habitat module show workshop-fabricator-1`
- Run `habitat module show basic-battery-1`
- Run `habitat module show small-solar-array-1`
- Verify that a battery with `0` usable energy produces clearer CLI messages
