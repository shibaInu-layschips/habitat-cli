import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHabitat } from "../src/cli";
import { hydrateModules, readModuleState } from "../src/module-storage";
import type { HabitatModule } from "../src/types";

const workshopModule: HabitatModule = {
  id: "module-workshop",
  slug: "workshop-fabricator-1",
  blueprintId: "workshop-fabricator",
  displayName: "Workshop Fabricator",
  connectedTo: ["command-module-1"],
  runtimeAttributes: {
    condition: 92,
    status: "idle",
    powerDrawKw: {
      offline: 0,
      idle: 1,
      online: 1.25,
      active: 4,
      damaged: 6,
    },
  },
  capabilities: ["fabrication"],
};

let originalCwd = "";
let workspaceDir = "";
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalExitCode: typeof process.exitCode;
let output: string[] = [];
let errors: string[] = [];

beforeEach(async () => {
  originalCwd = process.cwd();
  originalLog = console.log;
  originalError = console.error;
  originalExitCode = process.exitCode;
  output = [];
  errors = [];

  console.log = (...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-cli-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.exitCode = undefined;
});

afterEach(async () => {
  console.log = originalLog;
  console.error = originalError;
  process.exitCode = originalExitCode ?? 0;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("habitat CLI", () => {
  test("sets one module status and prints the power draw for that state", async () => {
    await hydrateModules("habitat-1", [workshopModule]);

    await runHabitat(["bun", "habitat", "module", "set-status", "workshop-fabricator-1", "active"]);

    const state = await readModuleState();
    const [storedModule] = state.modules;

    expect(storedModule).toEqual({
      ...workshopModule,
      runtimeAttributes: {
        ...workshopModule.runtimeAttributes,
        status: "active",
      },
    });
    expect(output.join("\n")).toContain('Set module "workshop-fabricator-1" status to active.');
    expect(output.join("\n")).toContain("Current Power Draw: 4 kW");
    expect(errors).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  test("rejects unsupported module statuses", async () => {
    await hydrateModules("habitat-1", [workshopModule]);

    await runHabitat(["bun", "habitat", "module", "set-status", "workshop-fabricator-1", "sleeping"]);

    const state = await readModuleState();
    const [storedModule] = state.modules;

    expect(storedModule?.runtimeAttributes.status).toBe("idle");
    expect(errors.join("\n")).toContain("Status must be one of: offline, idle, online, active, damaged.");
    expect(process.exitCode).toBe(1);
  });
});
