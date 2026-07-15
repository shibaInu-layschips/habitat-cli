import { readHumanState } from "./human-storage";
import { collectWorldResource } from "./kepler-world-collect";
import { assertCoordinateInCurrentKeplerSector } from "./kepler-world-scan";
import { listModules } from "./module-storage";
import { readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { EvaState, HabitatModule } from "./types";

const EVA_STATE_NAMESPACE = "eva";
const SUITPORT_CAPABILITY = "suitport-access";
const DEFAULT_EVA_CARRYING_CAPACITY_KG = 20;

function defaultEvaState(): EvaState {
  return {
    habitatId: null,
    deployedHumanId: null,
    x: 0,
    y: 0,
    carriedResources: {},
    maxCarryingCapacityKg: 0,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvaState(value: unknown): EvaState {
  if (!isObject(value)) {
    return defaultEvaState();
  }

  const carriedResources = isObject(value.carriedResources)
    ? Object.fromEntries(
        Object.entries(value.carriedResources).filter(([, quantity]) => typeof quantity === "number" && quantity >= 0),
      ) as Record<string, number>
    : {};

  return {
    habitatId: typeof value.habitatId === "string" ? value.habitatId : null,
    deployedHumanId: typeof value.deployedHumanId === "string" ? value.deployedHumanId : null,
    x: typeof value.x === "number" && Number.isInteger(value.x) ? value.x : 0,
    y: typeof value.y === "number" && Number.isInteger(value.y) ? value.y : 0,
    carriedResources,
    maxCarryingCapacityKg:
      typeof value.maxCarryingCapacityKg === "number" && value.maxCarryingCapacityKg >= 0
        ? value.maxCarryingCapacityKg
        : 0,
  };
}

function readEvaStateBlob() {
  const raw = readStateBlob(EVA_STATE_NAMESPACE);

  if (!raw) {
    return defaultEvaState();
  }

  try {
    return parseEvaState(JSON.parse(raw));
  } catch {
    return defaultEvaState();
  }
}

function writeEvaStateBlob(state: EvaState) {
  writeStateBlob(EVA_STATE_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

function totalCarriedKg(state: EvaState) {
  return Object.values(state.carriedResources).reduce((total, quantity) => total + quantity, 0);
}

function parseCollectedResource(responseBody: unknown, requestedQuantityKg: number) {
  const response = isObject(responseBody) ? responseBody : {};
  const collected = isObject(response.collected) ? response.collected : response;
  const resourceType = typeof collected.resourceType === "string" && collected.resourceType.length > 0
    ? collected.resourceType
    : null;
  const quantityKg =
    typeof collected.quantityKg === "number" ? collected.quantityKg :
      typeof collected.quantity === "number" ? collected.quantity : null;

  if (!resourceType || quantityKg === null || !Number.isFinite(quantityKg) || quantityKg <= 0) {
    throw new Error("Kepler returned an invalid collection result.");
  }

  if (quantityKg > requestedQuantityKg) {
    throw new Error("Kepler returned more material than requested.");
  }

  return { resourceType, quantityKg };
}

export async function readEvaState() {
  return readEvaStateBlob();
}

export async function resetEvaState() {
  writeEvaStateBlob(defaultEvaState());
}

async function getActiveSuitport() {
  const modules = await listModules();
  return modules.find((module) => {
    const status = module.runtimeAttributes.status;
    return module.capabilities.includes(SUITPORT_CAPABILITY) && status !== "offline" && status !== "damaged";
  }) ?? null;
}

function getMaxCarryingCapacityKg(module: HabitatModule) {
  const keys = [
    "maxCarryingCapacityKg",
    "carryingCapacityKg",
    "evaCarryingCapacityKg",
    "evaCarryCapacityKg",
  ];

  for (const key of keys) {
    const value = module.runtimeAttributes[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return DEFAULT_EVA_CARRYING_CAPACITY_KG;
}

export async function deployExplorer(humanId: string) {
  const current = await readEvaState();

  if (current.deployedHumanId) {
    throw new Error(`Human "${current.deployedHumanId}" is already deployed.`);
  }

  const humanState = await readHumanState();
  const human = humanState.humans.find((candidate) => candidate.id === humanId);

  if (!human) {
    throw new Error(`No human with ID "${humanId}" was found.`);
  }

  const suitport = await getActiveSuitport();

  if (!suitport) {
    throw new Error("No active suitport module is available.");
  }

  if (human.locationModuleId !== suitport.id && human.locationModuleId !== suitport.slug) {
    throw new Error(`Human "${humanId}" must be in the active suitport module before deployment.`);
  }

  const maxCarryingCapacityKg = getMaxCarryingCapacityKg(suitport);

  const nextState: EvaState = {
    habitatId: humanState.habitatId,
    deployedHumanId: human.id,
    x: 0,
    y: 0,
    carriedResources: {},
    maxCarryingCapacityKg,
  };
  writeEvaStateBlob(nextState);
  return nextState;
}

export async function moveExplorer(x: number, y: number) {
  const current = await readEvaState();

  if (!current.deployedHumanId) {
    throw new Error("No human is currently deployed.");
  }

  if (Math.abs(x - current.x) + Math.abs(y - current.y) !== 1) {
    throw new Error("Explorer movement must be exactly one adjacent grid tile north, south, east, or west.");
  }

  if (!current.habitatId) {
    throw new Error("The deployed explorer is not associated with a registered Habitat.");
  }

  await assertCoordinateInCurrentKeplerSector(current.habitatId, x, y);

  const nextState = { ...current, x, y };
  writeEvaStateBlob(nextState);
  return nextState;
}

export async function dockExplorer() {
  const current = await readEvaState();

  if (!current.deployedHumanId) {
    throw new Error("No human is currently deployed.");
  }

  if (current.x !== 0 || current.y !== 0) {
    throw new Error("The explorer can only dock at (0, 0).");
  }

  const nextState: EvaState = {
    ...current,
    deployedHumanId: null,
    carriedResources: {},
  };
  writeEvaStateBlob(nextState);
  return nextState;
}

export async function collectExplorer(quantityKg: number) {
  const current = await readEvaState();

  if (!current.deployedHumanId) {
    throw new Error("No human is currently deployed.");
  }

  if (!Number.isInteger(quantityKg) || quantityKg <= 0) {
    throw new Error("Collection quantity must be a positive whole number of kilograms.");
  }

  if (!current.habitatId) {
    throw new Error("The deployed explorer is not associated with a registered Habitat.");
  }

  if (totalCarriedKg(current) + quantityKg > current.maxCarryingCapacityKg) {
    throw new Error("Collection would exceed the explorer's carrying capacity.");
  }

  const responseBody = await collectWorldResource({
    habitatId: current.habitatId,
    x: current.x,
    y: current.y,
    quantityKg,
  });
  const collected = parseCollectedResource(responseBody, quantityKg);

  if (totalCarriedKg(current) + collected.quantityKg > current.maxCarryingCapacityKg) {
    throw new Error("Kepler returned more material than the explorer can carry.");
  }

  const nextState: EvaState = {
    ...current,
    carriedResources: {
      ...current.carriedResources,
      [collected.resourceType]: (current.carriedResources[collected.resourceType] ?? 0) + collected.quantityKg,
    },
  };
  writeEvaStateBlob(nextState);
  return {
    ...nextState,
    collectedResourceType: collected.resourceType,
    collectedQuantityKg: collected.quantityKg,
  };
}
