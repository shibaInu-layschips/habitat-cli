# Construction Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `habitat construct <blueprint-id>` so the CLI can start a local construction job, spend inventory immediately, and complete the new module after enough simulation ticks.

**Architecture:** Keep Kepler as the source of blueprint data and keep all construction lifecycle state local. Store active construction jobs in a new `.habitat/construction.json` file, reuse the existing dry-run readiness evaluation before starting work, and extend tick progression so active jobs consume build ticks and create finished modules only on completion.

**Tech Stack:** Bun, TypeScript, Commander.js, local JSON file persistence

## Global Constraints

- Use Bun for all scripts and tests.
- Keep entrypoint files focused on orchestration and move domain logic into focused modules.
- Keep Kepler blueprint data separate from local construction and simulation state.
- Preserve existing JSON data when possible and do not silently delete unrelated keys.
- Use TDD: write the failing test first and verify it fails before implementation.

---

## File Structure

- Create: `src/construction-storage.ts`
  - Owns `.habitat/construction.json` reads/writes plus job create/update/remove helpers.
- Modify: `src/types.ts`
  - Adds shared local construction job types.
- Modify: `src/inventory-storage.ts`
  - Adds helpers to validate and deduct required resources without rewriting unrelated inventory state.
- Modify: `src/construction-readiness.ts`
  - Exposes enough readiness detail to start a job and reject busy facilities.
- Modify: `src/power-simulation.ts`
  - Advances construction jobs during ticks and creates finished modules when jobs complete.
- Modify: `src/cli.ts`
  - Wires `habitat construct <blueprint-id>` and prints start confirmations.
- Modify: `tests/cli.test.ts`
  - Covers successful start, failed start, and busy-facility behavior.
- Modify: `tests/power-simulation.test.ts`
  - Covers job progression and module creation on tick completion.

### Task 1: Add Local Construction Job Storage

**Files:**
- Create: `src/construction-storage.ts`
- Modify: `src/types.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `InventoryItem`, `HabitatModule`, `SimulationState`
- Produces:
  - `type ConstructionJob = { id: string; blueprintId: string; outputModuleType: string; facilityModuleSlug: string; startedAtTick: number; remainingBuildTicks: number; spentResources: Record<string, number>; status: "active" | "complete" }`
  - `type ConstructionState = { jobs: ConstructionJob[] }`
  - `readConstructionState(): Promise<ConstructionState>`
  - `writeConstructionState(state: ConstructionState): Promise<void>`
  - `createConstructionJob(job: ConstructionJob): Promise<void>`
  - `listActiveConstructionJobs(): Promise<ConstructionJob[]>`
  - `findActiveJobByFacility(facilityModuleSlug: string): Promise<ConstructionJob | null>`

- [ ] **Step 1: Write the failing CLI test for a successful construction start**

```ts
test("starts local construction, spends inventory, and records a job", async () => {
  await hydrateModules("habitat-1", [
    {
      ...workshopModule,
      runtimeAttributes: { ...workshopModule.runtimeAttributes, status: "idle" },
    },
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
      runtimeAttributes: { status: "active", currentEnergyKwh: 120, energyStorageKwh: 500 },
      capabilities: ["power-storage"],
    },
  ]);
  await hydrateInventory([
    { resourceType: "ferrite", displayName: "Ferrite", quantity: 90, unit: "kg" },
    { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 45, unit: "kg" },
    { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 18, unit: "kg" },
  ]);

  globalThis.fetch = async () =>
    new Response(JSON.stringify({
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
        runtimeAttributes: { powerGenerationKw: 12 },
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  await runHabitat(["bun", "habitat", "construct", "small-solar-array"]);

  const inventory = JSON.parse(await readFile(join(process.cwd(), ".habitat", "inventory.json"), "utf8"));
  const construction = JSON.parse(await readFile(join(process.cwd(), ".habitat", "construction.json"), "utf8"));

  expect(output.join("\n")).toContain("Started Construction Job");
  expect(output.join("\n")).toContain("Module Will Create: small-solar-array");
  expect(output.join("\n")).toContain('Resources Spent: {"ferrite":90,"silicate-glass":45,"conductive-ore":18}');
  expect(inventory.items).toEqual([
    { resourceType: "ferrite", displayName: "Ferrite", quantity: 0, unit: "kg" },
    { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 0, unit: "kg" },
    { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 0, unit: "kg" },
  ]);
  expect(construction.jobs).toHaveLength(1);
  expect(construction.jobs[0]).toMatchObject({
    blueprintId: "small-solar-array",
    outputModuleType: "small-solar-array",
    facilityModuleSlug: "workshop-fabricator-1",
    remainingBuildTicks: 180,
    status: "active",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli.test.ts -t "starts local construction, spends inventory, and records a job"`
Expected: FAIL because `construct` only supports `--dry-run` and no `construction.json` is written.

- [ ] **Step 3: Add shared construction job types**

```ts
export type ConstructionJob = {
  id: string;
  blueprintId: string;
  outputModuleType: string;
  facilityModuleSlug: string;
  startedAtTick: number;
  remainingBuildTicks: number;
  spentResources: Record<string, number>;
  status: "active" | "complete";
};

export type ConstructionState = {
  jobs: ConstructionJob[];
};
```

- [ ] **Step 4: Add construction storage module**

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ConstructionJob, ConstructionState } from "./types";

function getConstructionFilePath() {
  return join(process.cwd(), ".habitat", "construction.json");
}

function defaultConstructionState(): ConstructionState {
  return { jobs: [] };
}

export async function readConstructionState(): Promise<ConstructionState> {
  const filePath = getConstructionFilePath();
  if (!existsSync(filePath)) {
    return defaultConstructionState();
  }

  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as { jobs?: unknown };
  return {
    jobs: Array.isArray(parsed.jobs) ? (parsed.jobs as ConstructionJob[]) : [],
  };
}

export async function writeConstructionState(state: ConstructionState) {
  const filePath = getConstructionFilePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function createConstructionJob(job: ConstructionJob) {
  const state = await readConstructionState();
  state.jobs.push(job);
  await writeConstructionState(state);
}
```

- [ ] **Step 5: Run focused test to verify it still fails for missing start behavior**

Run: `bun test tests/cli.test.ts -t "starts local construction, spends inventory, and records a job"`
Expected: FAIL because CLI start logic and inventory deduction are not implemented yet.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/construction-storage.ts tests/cli.test.ts
git commit -m "feat: add construction job storage"
```

### Task 2: Start Construction From The CLI

**Files:**
- Modify: `src/inventory-storage.ts`
- Modify: `src/construction-readiness.ts`
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes:
  - `evaluateConstructionDryRun(blueprint: KeplerBlueprint): Promise<ConstructionDryRunResult>`
  - `readSimulationState(): Promise<SimulationState>`
  - `createConstructionJob(job: ConstructionJob): Promise<void>`
- Produces:
  - `spendInventoryResources(required: Record<string, number>): Promise<void>`
  - `startConstructionJob(blueprint: KeplerBlueprint): Promise<ConstructionJob>`

- [ ] **Step 1: Write the failing busy-facility test**

```ts
test("rejects starting construction when the fabricator already has an active job", async () => {
  await writeFile(join(process.cwd(), ".habitat", "construction.json"), JSON.stringify({
    jobs: [
      {
        id: "job-1",
        blueprintId: "water-recycler",
        outputModuleType: "water-recycler",
        facilityModuleSlug: "workshop-fabricator-1",
        startedAtTick: 0,
        remainingBuildTicks: 200,
        spentResources: { ferrite: 10 },
        status: "active",
      },
    ],
  }, null, 2));

  await runHabitat(["bun", "habitat", "construct", "small-solar-array"]);

  expect(errors.join("\n")).toContain("workshop-fabricator-1 is already busy with another construction job.");
  expect(process.exitCode).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/cli.test.ts -t "rejects starting construction when the fabricator already has an active job"`
Expected: FAIL because readiness does not yet consider active construction jobs.

- [ ] **Step 3: Add inventory deduction helper**

```ts
export async function spendInventoryResources(required: Record<string, number>) {
  const state = await readInventoryState();
  const nextItems = state.items.map((item) => {
    const spend = required[item.resourceType] ?? 0;
    return spend > 0 ? { ...item, quantity: item.quantity - spend } : item;
  });

  await writeInventoryState({ items: nextItems });
}
```

- [ ] **Step 4: Make readiness treat active jobs as facility locks**

```ts
const activeJob = await findActiveJobByFacility(facility.slug);
if (activeJob) {
  return {
    label: "Fabricator Available",
    passed: false,
    detail: `${facility.slug} is already busy with another construction job.`,
  };
}
```

- [ ] **Step 5: Implement CLI start path**

```ts
if (!options.dryRun) {
  const registration = await readRegistration();
  await ensureLocalModulesFromRegistration(registration);
  const blueprint = await showBlueprintCatalogEntry(blueprintId);
  const result = await evaluateConstructionDryRun(blueprint);

  if (!result.canStart) {
    printConstructionPreview(result);
    process.exitCode = 1;
    return;
  }

  const simulationState = await readSimulationState();
  await spendInventoryResources(result.blueprint.inputs as Record<string, number>);
  const job = {
    id: crypto.randomUUID(),
    blueprintId: result.blueprint.blueprintId,
    outputModuleType: String(result.blueprint.output.moduleType),
    facilityModuleSlug: result.fabricatorAvailable.detail.includes("workshop-fabricator-1")
      ? "workshop-fabricator-1"
      : "unknown-facility",
    startedAtTick: simulationState.currentTick,
    remainingBuildTicks: result.blueprint.buildTicks,
    spentResources: result.blueprint.inputs as Record<string, number>,
    status: "active" as const,
  };
  await createConstructionJob(job);
  console.log("Started Construction Job");
  console.log(`Job ID: ${job.id}`);
  console.log(`Module Will Create: ${job.outputModuleType}`);
  console.log(`Resources Spent: ${JSON.stringify(job.spentResources)}`);
  console.log(`Remaining Build Ticks: ${job.remainingBuildTicks}`);
  return;
}
```

- [ ] **Step 6: Run focused CLI tests**

Run: `bun test tests/cli.test.ts`
Expected: PASS for dry-run tests and new construction start tests.

- [ ] **Step 7: Commit**

```bash
git add src/inventory-storage.ts src/construction-readiness.ts src/cli.ts tests/cli.test.ts
git commit -m "feat: start local construction jobs"
```

### Task 3: Advance Construction Jobs During Ticks

**Files:**
- Modify: `src/construction-storage.ts`
- Modify: `src/module-storage.ts`
- Modify: `src/power-simulation.ts`
- Test: `tests/power-simulation.test.ts`

**Interfaces:**
- Consumes:
  - `listActiveConstructionJobs(): Promise<ConstructionJob[]>`
  - `writeConstructionState(state: ConstructionState): Promise<void>`
  - `createModule(module: HabitatModule): Promise<HabitatModule>`
- Produces:
  - `advanceConstructionJobs(ticksApplied: number, endTick: number): Promise<void>`

- [ ] **Step 1: Write the failing tick-completion test**

```ts
test("completes construction jobs during ticks and creates the finished module", async () => {
  await hydrateModules("habitat-1", [batteryModule, workshopModule]);
  await writeFile(join(process.cwd(), ".habitat", "construction.json"), JSON.stringify({
    jobs: [
      {
        id: "job-1",
        blueprintId: "small-solar-array",
        outputModuleType: "small-solar-array",
        facilityModuleSlug: "workshop-fabricator-1",
        startedAtTick: 0,
        remainingBuildTicks: 2,
        spentResources: { ferrite: 90 },
        status: "active",
      },
    ],
  }, null, 2));

  await runPowerTicks(2);

  const modules = await listModules();
  const construction = JSON.parse(await readFile(join(process.cwd(), ".habitat", "construction.json"), "utf8"));

  expect(modules.some((module) => module.blueprintId === "small-solar-array")).toBe(true);
  expect(construction.jobs[0].status).toBe("complete");
  expect(construction.jobs[0].remainingBuildTicks).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/power-simulation.test.ts -t "completes construction jobs during ticks and creates the finished module"`
Expected: FAIL because `runPowerTicks` does not yet touch construction jobs.

- [ ] **Step 3: Add construction advancement helper**

```ts
export async function advanceConstructionJobs(ticksApplied: number) {
  const state = await readConstructionState();
  const activeJobs = state.jobs.filter((job) => job.status === "active");

  for (const job of activeJobs) {
    job.remainingBuildTicks = Math.max(0, job.remainingBuildTicks - ticksApplied);

    if (job.remainingBuildTicks === 0) {
      job.status = "complete";
      await createModule({
        id: crypto.randomUUID(),
        slug: "",
        blueprintId: job.outputModuleType,
        displayName: job.outputModuleType,
        connectedTo: [],
        runtimeAttributes: { status: "online", health: 100 },
        capabilities: [],
      });
    }
  }

  await writeConstructionState(state);
}
```

- [ ] **Step 4: Call construction advancement from `runPowerTicks`**

```ts
for (let index = 0; index < ticksRequested; index += 1) {
  simulationState.currentTick += 1;
  batteryEnergyAfterKwh = roundKwh(batteryEnergyAfterKwh - drainPerTickKwh);
}

await advanceConstructionJobs(ticksRequested);
```

- [ ] **Step 5: Run focused power simulation tests**

Run: `bun test tests/power-simulation.test.ts`
Expected: PASS including the new construction completion case.

- [ ] **Step 6: Commit**

```bash
git add src/construction-storage.ts src/power-simulation.ts tests/power-simulation.test.ts
git commit -m "feat: complete construction jobs during ticks"
```

### Task 4: Final Verification

**Files:**
- Modify: `src/cli.ts` (only if output cleanup is still needed)
- Test: `tests/cli.test.ts`
- Test: `tests/power-simulation.test.ts`

**Interfaces:**
- Consumes: all earlier task outputs
- Produces: final verified CLI behavior

- [ ] **Step 1: Run typecheck**

Run: `bun run check`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `bun test`
Expected: PASS

- [ ] **Step 3: Manually smoke-test command flow**

Run: `bun run src/index.ts construct small-solar-array --dry-run`
Expected: prints the construction preview and does not modify local files

Run: `bun run src/index.ts construct small-solar-array`
Expected: prints started-job confirmation and writes `.habitat/construction.json`

- [ ] **Step 4: Commit**

```bash
git add src tests docs/superpowers/plans/2026-07-08-construction-start.md
git commit -m "feat: add local construction start flow"
```
