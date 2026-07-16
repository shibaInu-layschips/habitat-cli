import {
  ensureLocalModulesFromRegistration,
  readRegistration,
} from "./kepler-registration";
import { buildModuleSlug, createModule, listModules, readModuleState, writeModuleState } from "./module-storage";
import { readConstructionState, writeConstructionState } from "./construction-storage";
import { readSolarIrradianceReading } from "./kepler-irradiance";
import { getSqliteDatabaseFilePath, readStateBlob, writeStateBlob } from "./sqlite-storage";
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
  batteryDrainKwh: number;
  batteryEnergyBeforeKwh: number;
  batteryEnergyAfterKwh: number;
  batteryDrainedKwh: number;
  batteryModule: HabitatModule;
  solarIrradianceWPerM2: number | null;
  solarCondition: string | null;
  solarModuleCount: number;
  solarGenerationKw: number;
  solarGeneratedKwh: number;
  solarChargeAppliedKwh: number;
  solarChargingReport: string;
  completedConstructionJobs: ConstructionJob[];
};

function getDataFilePath() {
  return getSqliteDatabaseFilePath();
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

export function getSimulationFilePath() {
  return getDataFilePath();
}

export async function readSimulationState(): Promise<SimulationState> {
  const raw = readStateBlob("simulation");
  let parsed: unknown = null;

  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  const currentTick = isObject(parsed) ? asNumber(parsed.currentTick) : null;

  return {
    currentTick: currentTick ?? defaultSimulationState().currentTick,
  };
}

export async function writeSimulationState(state: SimulationState) {
  writeStateBlob("simulation", `${JSON.stringify({
    currentTick: state.currentTick,
  }, null, 2)}\n`);
}

function getRuntimeAttributes(module: HabitatModule) {
  return isObject(module.runtimeAttributes) ? module.runtimeAttributes : {};
}

function findEffectivelyGeneratingSolarModules(modules: HabitatModule[]) {
  return modules.filter((module) => getModuleSolarGenerationKw(module) > 0);
}

function getBatteryChargeBlocker(module: HabitatModule) {
  const status = getModuleStatus(module);
  if (status !== "online" && status !== "active") {
    return "the battery is not online or active";
  }

  const runtimeAttributes = getRuntimeAttributes(module);
  const currentEnergyKwh = asNumber(runtimeAttributes.currentEnergyKwh);
  const energyStorageKwh = asNumber(runtimeAttributes.energyStorageKwh);

  if (currentEnergyKwh === null || energyStorageKwh === null) {
    return "the battery is missing charge state";
  }

  if (currentEnergyKwh >= energyStorageKwh) {
    return "the battery is already full";
  }

  return null;
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

export function getModuleSolarGenerationKw(module: HabitatModule) {
  if (!module.capabilities.includes("solar-generation")) {
    return 0;
  }

  const status = getModuleStatus(module);
  if (status !== "online" && status !== "active") {
    return 0;
  }

  const runtimeAttributes = getRuntimeAttributes(module);
  return asNumber(runtimeAttributes.powerGenerationKw) ?? 0;
}

function getTotalPowerGenerationKw(modules: HabitatModule[]) {
  return modules.reduce((total, module) => total + getModuleSolarGenerationKw(module), 0);
}

function getBatteryEnergyKwh(module: HabitatModule) {
  const runtimeAttributes = getRuntimeAttributes(module);
  return asNumber(runtimeAttributes.currentEnergyKwh) ?? asNumber(runtimeAttributes.energyStorageKwh) ?? 0;
}

function getBatteryCapacityKwh(module: HabitatModule) {
  const runtimeAttributes = getRuntimeAttributes(module);
  return asNumber(runtimeAttributes.energyStorageKwh) ?? asNumber(runtimeAttributes.currentEnergyKwh) ?? 0;
}

function getSolarChargeKwhPerTick(solarIrradianceWPerM2: number, solarGenerationKw: number) {
  const solarMultiplier = solarIrradianceWPerM2 / 900;
  const solarEfficiency = 0.5;
  return (solarGenerationKw * solarMultiplier * solarEfficiency) / 3600;
}

function formatIrradianceValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function roundKwh(value: number) {
  return Math.max(0, Number(value.toFixed(6)));
}

function describeSolarChargingFailure(
  solarModuleCount: number,
  batteryChargeBlocker: string | null,
  solarIrradianceWPerM2: number | null,
  solarCondition: string | null,
) {
  if (solarModuleCount === 0) {
    return "No solar charging happened because no effectively generating solar modules were found.";
  }

  if (batteryChargeBlocker !== null) {
    return `No solar charging happened because ${batteryChargeBlocker}.`;
  }

  if (solarIrradianceWPerM2 === null) {
    return "No solar charging happened because Kepler did not return a usable solar irradiance reading.";
  }

  if (solarIrradianceWPerM2 <= 0) {
    return `No solar charging happened because solar irradiance was ${formatIrradianceValue(solarIrradianceWPerM2)} W/m^2 (${solarCondition ?? "unknown"}).`;
  }

  return "No solar charging happened.";
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

async function advanceConstructionJobs(ticksApplied: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Tick simulation was stopped.", "AbortError");
  }
  const constructionState = await readConstructionState();
  const completedJobs: ConstructionJob[] = [];

  for (const job of constructionState.jobs) {
    if (signal?.aborted) {
      throw new DOMException("Tick simulation was stopped.", "AbortError");
    }
    if (job.status !== "active") {
      continue;
    }

    job.remainingBuildTicks = Math.max(0, job.remainingBuildTicks - ticksApplied);

    if (job.remainingBuildTicks === 0) {
      job.status = "complete";
      await completeConstructionJob(job);
      if (signal?.aborted) {
        throw new DOMException("Tick simulation was stopped.", "AbortError");
      }
      completedJobs.push({ ...job });
    }
  }

  await writeConstructionState(constructionState);
  return completedJobs;
}

export async function runPowerTicks(ticksRequested: number, signal?: AbortSignal): Promise<PowerTickSummary> {
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
  const solarModules = findEffectivelyGeneratingSolarModules(moduleState.modules);
  const batteryChargeBlocker = getBatteryChargeBlocker(batteryModule);
  let solarIrradianceWPerM2: number | null = null;
  let solarCondition: string | null = null;

  if (solarModules.length > 0 && batteryChargeBlocker === null) {
    const irradianceReading = await readSolarIrradianceReading();
    solarIrradianceWPerM2 = irradianceReading?.wPerM2 ?? null;
    solarCondition = irradianceReading?.condition ?? null;
  }

  const solarGenerationKw = getTotalPowerGenerationKw(solarModules);
  const drainPerTickKwh = totalPowerDrawKw / 3600;
  const chargePerTickKwh =
    solarIrradianceWPerM2 !== null ? getSolarChargeKwhPerTick(solarIrradianceWPerM2, solarGenerationKw) : 0;
  const batteryDrainKwh = drainPerTickKwh * ticksRequested;
  const solarGeneratedKwh = chargePerTickKwh * ticksRequested;

  let batteryEnergyAfterKwh = batteryEnergyBeforeKwh;

  for (let index = 0; index < ticksRequested; index += 1) {
    if (signal?.aborted) {
      throw new DOMException("Tick simulation was stopped.", "AbortError");
    }

    simulationState.currentTick += 1;
    batteryEnergyAfterKwh = Math.min(
      batteryCapacityKwh,
      Math.max(0, batteryEnergyAfterKwh - drainPerTickKwh) + chargePerTickKwh,
    );

    if ((index + 1) % 1000 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  batteryEnergyAfterKwh = roundKwh(batteryEnergyAfterKwh);
  const solarChargeAppliedKwh = roundKwh(Math.max(0, batteryEnergyAfterKwh - (batteryEnergyBeforeKwh - batteryDrainKwh)));
  const solarChargingReport =
    solarGeneratedKwh > 0
      ? `Solar charging generated ${formatIrradianceValue(solarGeneratedKwh)} kWh and added ${formatIrradianceValue(solarChargeAppliedKwh)} kWh to the battery.`
      : describeSolarChargingFailure(solarModules.length, batteryChargeBlocker, solarIrradianceWPerM2, solarCondition);

  const batteryRuntimeAttributes = getRuntimeAttributes(batteryModule);
  batteryRuntimeAttributes.currentEnergyKwh = batteryEnergyAfterKwh;
  batteryRuntimeAttributes.energyStorageKwh = batteryCapacityKwh;
  batteryModule.runtimeAttributes = batteryRuntimeAttributes;

  if (signal?.aborted) {
    throw new DOMException("Tick simulation was stopped.", "AbortError");
  }
  await writeModuleState(moduleState);

  if (signal?.aborted) {
    throw new DOMException("Tick simulation was stopped.", "AbortError");
  }
  await writeSimulationState(simulationState);
  const completedConstructionJobs = await advanceConstructionJobs(ticksRequested, signal);

  return {
    ticksRequested,
    ticksApplied: ticksRequested,
    startTick,
    endTick: simulationState.currentTick,
    totalPowerDrawKw,
    batteryDrainKwh,
    batteryEnergyBeforeKwh,
    batteryEnergyAfterKwh,
    batteryDrainedKwh: roundKwh(batteryDrainKwh),
    batteryModule,
    solarIrradianceWPerM2,
    solarCondition,
    solarModuleCount: solarModules.length,
    solarGenerationKw,
    solarGeneratedKwh: roundKwh(solarGeneratedKwh),
    solarChargeAppliedKwh,
    solarChargingReport,
    completedConstructionJobs,
  };
}
