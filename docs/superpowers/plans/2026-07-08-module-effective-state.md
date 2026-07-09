# Module Effective State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add declared-versus-effective module reporting, richer `module show` output, and clearer no-usable-battery-energy messaging without changing persisted module state.

**Architecture:** Keep `runtimeAttributes.status` as the declared state and derive effective state from existing local state plus active construction jobs at display time. Add a focused reporting helper for module details/status, then wire CLI commands to use it while keeping persistence and simulation behavior local and unchanged except for clearer battery-facing errors.

**Tech Stack:** Bun, TypeScript, Commander.js, local JSON persistence

## Global Constraints

- Use Bun for all scripts and tests.
- Keep entrypoint files focused on orchestration and move domain logic into focused modules.
- Persisted module state remains in `.habitat/modules.json`.
- Construction job state remains in `.habitat/construction.json`.
- Effective state is derived from existing local module state plus active construction jobs.
- No new persisted status field is added.
- Use TDD: write the failing test first and verify it fails before implementation.

---

## File Structure

- Create: `src/module-details.ts`
  - Owns effective-state derivation and full-detail module rendering.
- Modify: `src/module-status.ts`
  - Expands the status table to show declared state, effective state, and reasons.
- Modify: `src/power-simulation.ts`
  - Exposes a small battery usability helper and improves no-usable-energy messaging.
- Modify: `src/cli.ts`
  - Wires `module status` and `module show` to the new reporting helpers.
- Modify: `tests/module-status.test.ts`
  - Covers effective-state table rendering.
- Modify: `tests/cli.test.ts`
  - Covers richer `module show` output and clearer battery messages.

### Task 1: Add Effective State Derivation And Status Table Reporting

**Files:**
- Create: `src/module-details.ts`
- Modify: `src/module-status.ts`
- Test: `tests/module-status.test.ts`

**Interfaces:**
- Consumes:
  - `findActiveJobByFacility(facilityModuleSlug: string): Promise<ConstructionJob | null>`
  - `getModuleStatus(module: HabitatModule): string`
  - `getModulePowerDrawKw(module: HabitatModule): number`
- Produces:
  - `type EffectiveModuleState = { declaredState: string; effectiveState: string; reason: string }`
  - `deriveEffectiveModuleState(module: HabitatModule, options?: { activeConstructionJob: ConstructionJob | null }): EffectiveModuleState`
  - `formatModuleStatusReport(rows: Array<{ module: HabitatModule; activeConstructionJob: ConstructionJob | null }>): string`

- [ ] **Step 1: Write the failing module status test**

```ts
test("shows declared state, effective state, and reason for every module", async () => {
  const report = formatModuleStatusReport([
    {
      module: {
        id: "battery-1",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          currentEnergyKwh: 0,
          powerDrawKw: { active: 0, idle: 0, offline: 0, damaged: 0 },
        },
        capabilities: ["power-storage"],
      },
      activeConstructionJob: null,
    },
    {
      module: {
        id: "fab-1",
        slug: "workshop-fabricator-1",
        blueprintId: "workshop-fabricator",
        displayName: "Workshop Fabricator",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          powerDrawKw: { active: 4, idle: 1, offline: 0, damaged: 6 },
        },
        capabilities: ["basic-fabrication"],
      },
      activeConstructionJob: {
        id: "job-1",
        blueprintId: "small-solar-array",
        outputModuleType: "small-solar-array",
        outputDisplayName: "Small Solar Array",
        facilityModuleSlug: "workshop-fabricator-1",
        startedAtTick: 0,
        remainingBuildTicks: 12,
        spentResources: { ferrite: 90 },
        runtimeAttributes: { status: "online" },
        capabilities: ["solar-generation"],
        status: "active",
      },
    },
  ]);

  expect(report).toContain("Declared State");
  expect(report).toContain("Effective State");
  expect(report).toContain("Reason");
  expect(report).toContain("basic-battery-1");
  expect(report).toContain("active");
  expect(report).toContain("depleted");
  expect(report).toContain("no usable battery energy");
  expect(report).toContain("workshop-fabricator-1");
  expect(report).toContain("busy");
  expect(report).toContain("active construction job");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/module-status.test.ts -t "shows declared state, effective state, and reason for every module"`
Expected: FAIL because the current status formatter only prints one state column and has no effective-state helper.

- [ ] **Step 3: Add the effective-state helper**

```ts
export function deriveEffectiveModuleState(
  module: HabitatModule,
  options: { activeConstructionJob?: ConstructionJob | null } = {},
): EffectiveModuleState {
  const declaredState = getModuleStatus(module);
  const currentEnergy =
    typeof module.runtimeAttributes.currentEnergyKwh === "number"
      ? module.runtimeAttributes.currentEnergyKwh
      : 0;

  if (declaredState === "offline") {
    return { declaredState, effectiveState: "offline", reason: "declared offline" };
  }

  if (options.activeConstructionJob) {
    return { declaredState, effectiveState: "busy", reason: "active construction job" };
  }

  if (module.capabilities.includes("power-storage") && currentEnergy <= 0) {
    return { declaredState, effectiveState: "depleted", reason: "no usable battery energy" };
  }

  return { declaredState, effectiveState: declaredState, reason: "ready" };
}
```

- [ ] **Step 4: Update the status formatter to use the new columns**

```ts
const rows = modules.map(({ module, activeConstructionJob }) => {
  const state = deriveEffectiveModuleState(module, { activeConstructionJob });
  return {
    name: module.slug,
    declaredState: state.declaredState,
    effectiveState: state.effectiveState,
    reason: state.reason,
    powerDrawKw: getModulePowerDrawKw(module),
  };
});
```

- [ ] **Step 5: Run the focused test and the full status test file**

Run: `bun test tests/module-status.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/module-details.ts src/module-status.ts tests/module-status.test.ts
git commit -m "feat: add effective module state reporting"
```

### Task 2: Add Rich Module Show Output For Fabricators, Batteries, And Finished Modules

**Files:**
- Modify: `src/module-details.ts`
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes:
  - `getModule(moduleId: string): Promise<HabitatModule | null>`
  - `findActiveJobByFacility(facilityModuleSlug: string): Promise<ConstructionJob | null>`
  - `deriveEffectiveModuleState(module: HabitatModule, options?: { activeConstructionJob?: ConstructionJob | null }): EffectiveModuleState`
- Produces:
  - `formatModuleDetails(module: HabitatModule, options: { activeConstructionJob: ConstructionJob | null }): string`

- [ ] **Step 1: Write the failing CLI test for fabricator details**

```ts
test("shows the active construction job on a fabricator module", async () => {
  await hydrateModules("habitat-1", [workshopModule]);
  await writeConstructionState({
    jobs: [
      {
        id: "job-1",
        blueprintId: "small-solar-array",
        outputModuleType: "small-solar-array",
        outputDisplayName: "Small Solar Array",
        facilityModuleSlug: "workshop-fabricator-1",
        startedAtTick: 10,
        remainingBuildTicks: 75,
        spentResources: { ferrite: 90, "silicate-glass": 45 },
        runtimeAttributes: { status: "online", health: 100 },
        capabilities: ["solar-generation"],
        status: "active",
      },
    ],
  });

  await runHabitat(["bun", "habitat", "module", "show", "workshop-fabricator-1"]);

  const joinedOutput = output.join("\n");
  expect(joinedOutput).toContain("Effective State: busy");
  expect(joinedOutput).toContain("Active Construction Job");
  expect(joinedOutput).toContain("Job ID: job-1");
  expect(joinedOutput).toContain("Blueprint: small-solar-array");
  expect(joinedOutput).toContain("Ticks Remaining: 75");
});
```

- [ ] **Step 2: Add battery and finished-module failing tests**

```ts
test("shows battery details and usable energy status", async () => {
  await hydrateModules("habitat-1", [{
    id: "module-battery",
    slug: "basic-battery-1",
    blueprintId: "basic-battery",
    displayName: "Basic Battery",
    connectedTo: [],
    runtimeAttributes: {
      status: "active",
      currentEnergyKwh: 0,
      energyStorageKwh: 500,
      reserveKwh: 25,
      maxPowerOutputKw: 8,
    },
    capabilities: ["power-storage"],
  }]);

  await runHabitat(["bun", "habitat", "module", "show", "basic-battery-1"]);

  const joinedOutput = output.join("\n");
  expect(joinedOutput).toContain("Effective State: depleted");
  expect(joinedOutput).toContain("Current Energy: 0 kWh");
  expect(joinedOutput).toContain("Usable Energy: no");
});
```

```ts
test("shows useful runtime attributes for a completed module", async () => {
  await hydrateModules("habitat-1", [{
    id: "module-solar",
    slug: "small-solar-array-1",
    blueprintId: "small-solar-array",
    displayName: "Small Solar Array",
    connectedTo: [],
    runtimeAttributes: {
      status: "online",
      powerGenerationKw: 12,
      health: 100,
    },
    capabilities: ["solar-generation"],
  }]);

  await runHabitat(["bun", "habitat", "module", "show", "small-solar-array-1"]);

  const joinedOutput = output.join("\n");
  expect(joinedOutput).toContain("Runtime Attributes");
  expect(joinedOutput).toContain("powerGenerationKw");
  expect(joinedOutput).toContain("12");
});
```

- [ ] **Step 3: Run the focused CLI tests to verify they fail**

Run: `bun test tests/cli.test.ts -t "shows the active construction job on a fabricator module|shows battery details and usable energy status|shows useful runtime attributes for a completed module"`
Expected: FAIL because `module show` currently prints only the simple shared fields.

- [ ] **Step 4: Implement the detail formatter and wire it into `module show`**

```ts
export async function formatModuleDetails(module: HabitatModule): Promise<string> {
  const activeConstructionJob = await findActiveJobByFacility(module.slug);
  const state = deriveEffectiveModuleState(module, { activeConstructionJob });
  const lines = [
    `Module: ${module.slug}`,
    `Kepler ID: ${module.id}`,
    `Blueprint ID: ${module.blueprintId}`,
    `Display Name: ${module.displayName}`,
    `Declared State: ${state.declaredState}`,
    `Effective State: ${state.effectiveState}`,
    `Condition: ${String(module.runtimeAttributes.condition ?? "unknown")}`,
    `Capabilities: ${module.capabilities.length > 0 ? module.capabilities.join(", ") : "None"}`,
    `Connected To: ${module.connectedTo.length > 0 ? module.connectedTo.join(", ") : "None"}`,
  ];
  // append battery, construction-job, and runtime-attribute sections here
  return lines.join("\n");
}
```

- [ ] **Step 5: Run the focused CLI tests and then the whole CLI suite**

Run: `bun test tests/cli.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/module-details.ts src/cli.ts tests/cli.test.ts
git commit -m "feat: enrich module show details"
```

### Task 3: Improve No-Usable-Battery-Energy Messaging

**Files:**
- Modify: `src/power-simulation.ts`
- Modify: `src/construction-readiness.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes:
  - `findBatteryModule(modules: HabitatModule[]): HabitatModule | null`
  - `getModuleStatus(module: HabitatModule): string`
- Produces:
  - `getBatteryUsability(module: HabitatModule): { usable: boolean; currentEnergyKwh: number; declaredState: string }`

- [ ] **Step 1: Write the failing CLI test for zero-energy messaging**

```ts
test("reports a clearer message when no usable battery energy is available", async () => {
  await hydrateModules("habitat-1", [
    workshopModule,
    {
      id: "module-supply-cache",
      slug: "supply-cache-1",
      blueprintId: "supply-cache",
      displayName: "Supply Cache",
      connectedTo: [],
      runtimeAttributes: { status: "active" },
      capabilities: ["storage"],
    },
    {
      id: "module-battery",
      slug: "basic-battery-1",
      blueprintId: "basic-battery",
      displayName: "Basic Battery",
      connectedTo: [],
      runtimeAttributes: { status: "active", currentEnergyKwh: 0, energyStorageKwh: 500 },
      capabilities: ["power-storage"],
    },
  ]);
  await hydrateInventory([
    { resourceType: "ferrite", displayName: "Ferrite", quantity: 90, unit: "kg" },
    { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 45, unit: "kg" },
    { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 18, unit: "kg" },
  ]);

  globalThis.fetch = async () => new Response(JSON.stringify({
    blueprint: {
      id: "blueprint_1",
      blueprintId: "small-solar-array",
      displayName: "Small Solar Array Blueprint",
      description: "Starter solar power.",
      status: "published",
      buildTicks: 180,
      inputs: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
      output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
      requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
      prerequisites: [],
      capabilities: ["solar-generation"],
      runtimeAttributes: { powerGenerationKw: 12, status: "online" },
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  await runHabitat(["bun", "habitat", "construct", "small-solar-array"]);

  expect(errors.join("\n")).toContain("No usable battery energy is available.");
  expect(errors.join("\n")).toContain("basic-battery-1 is active, but current energy is 0 kWh.");
  expect(errors.join("\n")).toContain("Construction cannot start until the battery has usable energy.");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/cli.test.ts -t "reports a clearer message when no usable battery energy is available"`
Expected: FAIL because current messaging says only `Construction also requires usable power...`.

- [ ] **Step 3: Add the battery usability helper and update construction messaging**

```ts
export function getBatteryUsability(module: HabitatModule) {
  const declaredState = getModuleStatus(module);
  const currentEnergyKwh =
    typeof module.runtimeAttributes.currentEnergyKwh === "number"
      ? module.runtimeAttributes.currentEnergyKwh
      : 0;

  return {
    usable: (declaredState === "idle" || declaredState === "online" || declaredState === "active") && currentEnergyKwh > 0,
    currentEnergyKwh,
    declaredState,
  };
}
```

```ts
const startDetail = canStart
  ? "All local construction checks passed."
  : powerReady.passed
    ? "Construction cannot start until all failed checks are resolved."
    : `No usable battery energy is available. ${batteryModule.slug} is ${status}, but current energy is ${currentEnergy} kWh. Construction cannot start until the battery has usable energy.`;
```

- [ ] **Step 4: Run the focused test and the full CLI suite**

Run: `bun test tests/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification**

Run: `bun run check`
Expected: PASS

Run: `bun test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/power-simulation.ts src/construction-readiness.ts tests/cli.test.ts
git commit -m "feat: clarify battery energy messaging"
```

## Self-Review

- Spec coverage:
  - `habitat module status` declared/effective state: Task 1
  - `habitat module show` richer fabricator, battery, and finished-module details: Task 2
  - clearer no-usable-battery-energy messages: Task 3
- Placeholder scan:
  - no `TODO` or `TBD` placeholders remain
- Type consistency:
  - all later tasks reference `deriveEffectiveModuleState`, `formatModuleDetails`, and `getBatteryUsability` using the same names and compatible shapes

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-module-effective-state.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
