# Kepler Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Kepler registration and unregistration commands while keeping the existing habitat summary in `habitat status`.

**Architecture:** Add a small registration module for config, persistence, and HTTP calls; then wire Commander commands and status rendering into the existing CLI. Keep registration data in `.habitat/registration.json` separate from `.habitat/data.json`.

**Tech Stack:** Bun, TypeScript, Commander, built-in `fetch`, local JSON persistence

## Global Constraints

- Keep `habitat status` as the existing local habitat summary.
- Add `habitat register --name "<habitat name>"`.
- Add `habitat unregister`.
- Persist registration data under `.habitat/`.
- Keep the implementation simple.

---

### Task 1: Add registration module

**Files:**
- Create: `src/kepler-registration.ts`

**Interfaces:**
- Produces: `readRegistration(): Promise<KeplerRegistration | null>`
- Produces: `registerHabitat(name: string): Promise<KeplerRegistration>`
- Produces: `unregisterHabitat(): Promise<boolean>`
- Produces: `getRegistrationFilePath(): string`

- [ ] Implement config loading, registration persistence, and HTTP helpers.

### Task 2: Wire registration into CLI

**Files:**
- Modify: `src/cli.ts`

**Interfaces:**
- Consumes: `readRegistration`, `registerHabitat`, `unregisterHabitat`

- [ ] Add help text entries for registration commands.
- [ ] Add `register` and `unregister` Commander commands.
- [ ] Add a registration section to `habitat status`.

### Task 3: Verify

**Files:**
- Modify: `package.json` only if needed

- [ ] Run `bun run check`.
- [ ] Inspect help output.
- [ ] Verify `habitat status` still works.
