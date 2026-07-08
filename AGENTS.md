# AGENTS.md

## Project Overview

This repository is a Bun + TypeScript command-line app named `habitat`.

It currently focuses on:

- Kepler habitat registration
- local starter-module storage
- power/tick simulation
- Commander.js-based CLI commands

## Tech Stack

- TypeScript
- Bun
- Commander.js

## Runbook

Use Bun for all package and script commands:

- `bun install`
- `bun run check`
- `bun test`
- `bun link`

The CLI entrypoint is:

- `src/index.ts`

The main command wiring lives in:

- `src/cli.ts`

## Project Structure

- `src/cli.ts`: top-level Commander command definitions and user-facing output
- `src/index.ts`: tiny executable entrypoint
- `src/kepler-registration.ts`: Kepler config, registration, unregister, local registration files
- `src/module-storage.ts`: local module persistence in `.habitat/modules.json`
- `src/module-status.ts`: module power/status reporting helpers
- `src/power-simulation.ts`: tick logic, battery drain, simulation state in `.habitat/data.json`
- `src/types.ts`: shared TypeScript types
- `tests/`: Bun test coverage

## Coding Guidelines

- Prefer TypeScript for all new code.
- Prefer Bun over npm for installs, scripts, and tests.
- Keep entrypoint files focused on orchestration.
- Put CLI command wiring in `src/cli.ts`.
- Put persistence logic in focused storage modules.
- Put simulation logic in focused domain modules.
- Use small named functions instead of large inline handlers.
- Avoid turning one file into a catch-all.
- Follow the existing simple, local-file-based architecture.

## CLI Rules

- Use Commander.js for argument parsing, help text, version output, and command behavior.
- Do not write a custom argument parser.
- Keep help text discoverable for both humans and coding agents.
- Prefer friendly, explicit error messages.

## State And Persistence

Local state is stored under `.habitat/`.

Important files:

- `.habitat/registration.json`: saved Kepler registration details
- `.habitat/modules.json`: local habitat modules
- `.habitat/data.json`: simulation/runtime state such as tick count

When changing persistence:

- preserve existing JSON data when possible
- do not silently delete unrelated keys
- keep formats simple and readable

## Testing Expectations

Before finishing work, run:

- `bun run check`
- `bun test`

When adding behavior:

- add or update tests in `tests/`
- prefer focused unit tests for storage, simulation, and CLI behavior

## Kepler Notes

- Use these docs for projects on Kepler:
  `https://planet.turingguild.com/docs`
- Open the human-facing Kepler docs at
  `https://planet.turingguild.com/docs`.
- Also inspect the agent-readable OpenAPI schema at
  `https://planet.turingguild.com/openapi.json`.
- Kepler registration data should remain separate from local simulation state.
- Starter modules should come from the Kepler response, not hard-coded values.
- Local runtime state may evolve after registration and should be treated as the current source of truth for simulation.

## Change Guidance

- Preserve existing CLI behavior unless the task asks to change it.
- Keep the implementation simple.
- Favor readable code over abstraction-heavy designs.
- If you add new commands, update help text and test coverage too.
