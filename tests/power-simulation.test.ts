import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findBatteryModule,
  getModulePowerDrawKw,
  getTotalPowerDrawKw,
  readSimulationState,
  runPowerTicks,
  writeSimulationState,
} from "../src/power-simulation";
import { hydrateModules, readModuleState } from "../src/module-storage";
import type { HabitatModule } from "../src/types";

const commandModule: HabitatModule = {
  id: "module-command",
  slug: "command-module-1",
  blueprintId: "command-module",
  displayName: "Command Module",
  connectedTo: [],
  runtimeAttributes: {
    health: 100,
    status: "active",
    powerDrawKw: {
      offline: 0,
      idle: 2,
      active: 2,
      damaged: 2,
    },
  },
  capabilities: ["habitat-command"],
};

const lifeSupportModule: HabitatModule = {
  id: "module-life-support",
  slug: "life-support-1",
  blueprintId: "life-support",
  displayName: "Life Support",
  connectedTo: [],
  runtimeAttributes: {
    health: 100,
    status: "damaged",
    powerDrawKw: {
      offline: 0,
      idle: 5,
      active: 5,
      damaged: 7,
    },
  },
  capabilities: ["atmosphere-control"],
};

const batteryModule: HabitatModule = {
  id: "module-battery",
  slug: "basic-battery-1",
  blueprintId: "basic-battery",
  displayName: "Basic Battery",
  connectedTo: [],
  runtimeAttributes: {
    health: 100,
    status: "offline",
    currentEnergyKwh: 500,
    energyStorageKwh: 500,
    reserveKwh: 60,
    maxPowerOutputKw: 40,
    powerDrawKw: {
      offline: 0,
      idle: 0,
      active: 0,
      damaged: 0,
    },
  },
  capabilities: ["power-storage"],
};

let originalCwd = "";
let workspaceDir = "";

beforeEach(async () => {
  originalCwd = process.cwd();
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-power-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("power simulation", () => {
  test("calculates power draw from module status", () => {
    expect(getModulePowerDrawKw(commandModule)).toBe(2);
    expect(getModulePowerDrawKw(lifeSupportModule)).toBe(7);
    expect(getModulePowerDrawKw(batteryModule)).toBe(0);
    expect(getTotalPowerDrawKw([commandModule, lifeSupportModule, batteryModule])).toBe(9);
  });

  test("advances ticks and persists simulation state", async () => {
    await hydrateModules("habitat-1", [commandModule, lifeSupportModule, batteryModule]);
    await writeSimulationState({ currentTick: 12 });

    const summary = await runPowerTicks(10);

    expect(summary.startTick).toBe(12);
    expect(summary.endTick).toBe(22);
    expect(summary.ticksApplied).toBe(10);
    expect(summary.totalPowerDrawKw).toBe(9);
    expect(summary.batteryEnergyAfterKwh).toBeLessThan(summary.batteryEnergyBeforeKwh);

    const simulationState = await readSimulationState();
    expect(simulationState.currentTick).toBe(22);

    const moduleState = await readModuleState();
    const storedBattery = findBatteryModule(moduleState.modules);

    expect(storedBattery?.runtimeAttributes.currentEnergyKwh).toBe(summary.batteryEnergyAfterKwh);
  });

  test("clamps battery energy at zero", async () => {
    await hydrateModules("habitat-1", [
      commandModule,
      {
        ...batteryModule,
        runtimeAttributes: {
          ...batteryModule.runtimeAttributes,
          currentEnergyKwh: 0.001,
        },
      },
    ]);

    const summary = await runPowerTicks(1000);

    expect(summary.batteryEnergyAfterKwh).toBe(0);

    const moduleState = await readModuleState();
    const storedBattery = findBatteryModule(moduleState.modules);
    expect(storedBattery?.runtimeAttributes.currentEnergyKwh).toBe(0);
  });

  test("rejects invalid tick counts and missing battery modules", async () => {
    let invalidTickError: unknown = null;
    try {
      await runPowerTicks(0);
    } catch (error) {
      invalidTickError = error;
    }

    expect(invalidTickError).toBeInstanceOf(Error);
    expect((invalidTickError as Error).message).toContain("positive integer");

    await hydrateModules("habitat-1", [commandModule]);

    let missingBatteryError: unknown = null;
    try {
      await runPowerTicks(1);
    } catch (error) {
      missingBatteryError = error;
    }

    expect(missingBatteryError).toBeInstanceOf(Error);
    expect((missingBatteryError as Error).message).toContain("No battery module was found");
  });
});
