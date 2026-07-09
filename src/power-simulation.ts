import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ensureLocalModulesFromRegistration,
  readRegistration,
} from "./kepler-registration";
import { buildModuleSlug, createModule, listModules, readModuleState, writeModuleState } from "./module-storage";
import { readConstructionState, writeConstructionState } from "./construction-storage";
import type { ConstructionJob, HabitatModule } from "./types";

export type SimulationState = {
  currentTick: number;
};

export type PowerTickSummary = {
  ticksRequested: number;
  ticksApplied: number;
  startTick: number;
  endTick: number;
  totalPowerDrawKw: number;
  batteryEnergyBeforeKwh: number;
  batteryEnergyAfterKwh: number;
  batteryDrainedKwh: number;
  batteryModule: HabitatModule;
  completedConstructionJobs: ConstructionJob[];
};

function getDataFilePath() {
  return join(process.cwd(), ".habitat", "data.json");
}

function defaultSimulationState(): SimulationState {
  return {
    currentTick: 0,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumberRecord(value: unknown) {
  if (!isObject(value)) {
    return null;
  }

  const record: Record<string, number> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      record[key] = entry;
    }
  }

  return record;
}

async function ensureDataDir() {
  await mkdir(dirname(getDataFilePath()), { recursive: true });
}

async function readHabitatData() {
  const dataFilePath = getDataFilePath();
  if (!existsSync(dataFilePath)) {
    return {};
  }

  const raw = await readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw);
  return isObject(parsed) ? parsed : {};
}

export function getSimulationFilePath() {
  return getDataFilePath();
}

export async function readSimulationState(): Promise<SimulationState> {
  const data = await readHabitatData();
  const simulation = isObject(data.simulation) ? data.simulation : null;
  const currentTick = simulation ? asNumber(simulation.currentTick) : null;

  return {
    currentTick: currentTick ?? defaultSimulationState().currentTick,
  };
}

export async function writeSimulationState(state: SimulationState) {
  const data = await readHabitatData();
  data.simulation = {
    currentTick: state.currentTick,
  };

  await ensureDataDir();
  await writeFile(getDataFilePath(), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getRuntimeAttributes(module: HabitatModule) {
  return isObject(module.runtimeAttributes) ? module.runtimeAttributes : {};
}

export function getModuleStatus(module: HabitatModule) {
  const runtimeAttributes = getRuntimeAttributes(module);
  return asString(runtimeAttributes.status) ?? "idle";
}

export function findBatteryModule(modules: HabitatModule[]) {
  return (
    modules.find((module) => {
      const capabilityMatch = module.capabilities.includes("power-storage");
      const haystacks = [module.slug, module.id, module.blueprintId, module.displayName].map((value) =>
        value.toLowerCase(),
      );

      return capabilityMatch || haystacks.some((value) => value.includes("battery"));
    }) ?? null
  );
}

export function getModulePowerDrawKw(module: HabitatModule) {
  const runtimeAttributes = getRuntimeAttributes(module);
  const powerDrawKw = asNumberRecord(runtimeAttributes.powerDrawKw);
  if (!powerDrawKw) {
    return 0;
  }

  const status = getModuleStatus(module);
  return (
    powerDrawKw[status] ??
    powerDrawKw.idle ??
    powerDrawKw.active ??
    powerDrawKw.offline ??
    powerDrawKw.damaged ??
    0
  );
}

export function getTotalPowerDrawKw(modules: HabitatModule[]) {
  return modules.reduce((total, module) => total + getModulePowerDrawKw(module), 0);
}

function getBatteryEnergyKwh(module: HabitatModule) {
  const runtimeAttributes = getRuntimeAttributes(module);
  return asNumber(runtimeAttributes.currentEnergyKwh) ?? asNumber(runtimeAttributes.energyStorageKwh) ?? 0;
}

function getBatteryCapacityKwh(module: HabitatModule) {
  const runtimeAttributes = getRuntimeAttributes(module);
  return asNumber(runtimeAttributes.energyStorageKwh) ?? asNumber(runtimeAttributes.currentEnergyKwh) ?? 0;
}

function roundKwh(value: number) {
  return Math.max(0, Number(value.toFixed(6)));
}

async function completeConstructionJob(job: ConstructionJob) {
  const existingModules = await listModules();
  const nextIndex =
    existingModules.filter((module) => module.blueprintId === job.outputModuleType).length + 1;
  const slug = buildModuleSlug(job.outputModuleType, nextIndex);

  await createModule({
    id: `${job.outputModuleType}-${crypto.randomUUID()}`,
    slug,
    blueprintId: job.outputModuleType,
    displayName: job.outputDisplayName,
    connectedTo: [],
    runtimeAttributes: job.runtimeAttributes,
    capabilities: job.capabilities,
  });
}

async function advanceConstructionJobs(ticksApplied: number) {
  const constructionState = await readConstructionState();
  const completedJobs: ConstructionJob[] = [];

  for (const job of constructionState.jobs) {
    if (job.status !== "active") {
      continue;
    }

    job.remainingBuildTicks = Math.max(0, job.remainingBuildTicks - ticksApplied);

    if (job.remainingBuildTicks === 0) {
      job.status = "complete";
      await completeConstructionJob(job);
      completedJobs.push({ ...job });
    }
  }

  await writeConstructionState(constructionState);
  return completedJobs;
}

export async function runPowerTicks(ticksRequested: number): Promise<PowerTickSummary> {
  if (!Number.isInteger(ticksRequested) || ticksRequested < 1) {
    throw new Error("Tick count must be a positive integer.");
  }

  const registration = await readRegistration();
  await ensureLocalModulesFromRegistration(registration);

  const moduleState = await readModuleState();
  const batteryModule = findBatteryModule(moduleState.modules);

  if (!batteryModule) {
    throw new Error(
      'No battery module was found. Register the habitat first, then run "habitat register" to hydrate the starter modules.',
    );
  }

  const simulationState = await readSimulationState();
  const startTick = simulationState.currentTick;
  const totalPowerDrawKw = getTotalPowerDrawKw(moduleState.modules);
  const batteryEnergyBeforeKwh = getBatteryEnergyKwh(batteryModule);
  const batteryCapacityKwh = getBatteryCapacityKwh(batteryModule);
  const drainPerTickKwh = totalPowerDrawKw / 3600;

  let batteryEnergyAfterKwh = batteryEnergyBeforeKwh;

  for (let index = 0; index < ticksRequested; index += 1) {
    simulationState.currentTick += 1;
    batteryEnergyAfterKwh = roundKwh(batteryEnergyAfterKwh - drainPerTickKwh);
  }

  const batteryRuntimeAttributes = getRuntimeAttributes(batteryModule);
  batteryRuntimeAttributes.currentEnergyKwh = batteryEnergyAfterKwh;
  batteryRuntimeAttributes.energyStorageKwh = batteryCapacityKwh;
  batteryModule.runtimeAttributes = batteryRuntimeAttributes;

  await writeModuleState(moduleState);
  await writeSimulationState(simulationState);
  const completedConstructionJobs = await advanceConstructionJobs(ticksRequested);

  return {
    ticksRequested,
    ticksApplied: ticksRequested,
    startTick,
    endTick: simulationState.currentTick,
    totalPowerDrawKw,
    batteryEnergyBeforeKwh,
    batteryEnergyAfterKwh,
    batteryDrainedKwh: roundKwh(batteryEnergyBeforeKwh - batteryEnergyAfterKwh),
    batteryModule,
    completedConstructionJobs,
  };
}
