import { getHabitatApiJson, putHabitatApiJson } from "./habitat-api-client";
import { getSqliteDatabaseFilePath, readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { HabitatModule, HabitatModuleState } from "./types";

const MODULES_STATE_NAMESPACE = "modules";

function defaultModuleState(): HabitatModuleState {
  return {
    habitatId: null,
    modules: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function asRuntimeAttributes(value: unknown) {
  return isObject(value) ? value : null;
}

export function buildModuleSlug(blueprintId: string, index: number) {
  return `${blueprintId}-${index}`;
}

function parseModule(value: unknown): HabitatModule | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asString(value.id);
  const slug = asString(value.slug);
  const blueprintId = asString(value.blueprintId);
  const displayName = asString(value.displayName);
  const connectedTo = asStringArray(value.connectedTo);
  const runtimeAttributes = asRuntimeAttributes(value.runtimeAttributes);
  const capabilities = asStringArray(value.capabilities);

  if (!id || !blueprintId || !displayName || !connectedTo || !runtimeAttributes || !capabilities) {
    return null;
  }

  return {
    id,
    slug: slug ?? "",
    blueprintId,
    displayName,
    connectedTo,
    runtimeAttributes,
    capabilities,
  };
}

function applyMissingSlugs(modules: HabitatModule[]) {
  const counts = new Map<string, number>();

  return modules.map((module) => {
    const nextIndex = (counts.get(module.blueprintId) ?? 0) + 1;
    counts.set(module.blueprintId, nextIndex);

    return {
      ...module,
      slug: module.slug || buildModuleSlug(module.blueprintId, nextIndex),
    };
  });
}

function readModuleStateBlob(): HabitatModuleState {
  const raw = readStateBlob(MODULES_STATE_NAMESPACE);

  if (!raw) {
    return defaultModuleState();
  }

  try {
    const parsed = JSON.parse(raw) as { habitatId?: unknown; modules?: unknown };
    const habitatId = typeof parsed.habitatId === "string" ? parsed.habitatId : null;
    const modules = Array.isArray(parsed.modules)
      ? parsed.modules.map(parseModule).filter((module): module is HabitatModule => module !== null)
      : [];

    return {
      habitatId,
      modules: applyMissingSlugs(modules),
    };
  } catch {
    return defaultModuleState();
  }
}

function writeModuleStateBlob(state: HabitatModuleState) {
  writeStateBlob(MODULES_STATE_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

function shouldUseLocalModuleStorage() {
  return process.env.HABITAT_BACKEND_RUNTIME === "1" || !process.env.HABITAT_API_BASE_URL?.trim();
}

async function readModuleStateRemote(): Promise<HabitatModuleState> {
  return await getHabitatApiJson<HabitatModuleState>("/modules");
}

async function writeModuleStateRemote(state: HabitatModuleState) {
  return await putHabitatApiJson<HabitatModuleState>("/modules", state);
}

export function getModulesFilePath() {
  return getSqliteDatabaseFilePath();
}

export async function readModuleState(): Promise<HabitatModuleState> {
  if (shouldUseLocalModuleStorage()) {
    return readModuleStateBlob();
  }

  return await readModuleStateRemote();
}

export async function writeModuleState(state: HabitatModuleState) {
  if (shouldUseLocalModuleStorage()) {
    writeModuleStateBlob(state);
    return;
  }

  await writeModuleStateRemote(state);
}

export async function hydrateModules(habitatId: string | null, modules: HabitatModule[]) {
  await writeModuleState({
    habitatId,
    modules,
  });
}

export async function listModules() {
  const state = await readModuleState();
  return state.modules;
}

export async function countModules() {
  const state = await readModuleState();
  return state.modules.length;
}

export async function getModule(moduleId: string) {
  const state = await readModuleState();
  return state.modules.find((module) => module.id === moduleId || module.slug === moduleId) ?? null;
}

export async function createModule(module: HabitatModule) {
  const state = await readModuleState();
  const normalizedModule = {
    ...module,
    slug: module.slug || module.id,
  };

  if (
    state.modules.some(
      (existingModule) =>
        existingModule.id === normalizedModule.id || existingModule.slug === normalizedModule.slug,
    )
  ) {
    throw new Error(`A module with ID or slug "${normalizedModule.id}" already exists.`);
  }

  state.modules.push(normalizedModule);
  await writeModuleState(state);
  return normalizedModule;
}

export async function updateModule(
  moduleId: string,
  updates: Partial<Pick<HabitatModule, "blueprintId" | "displayName">> & { status?: string; condition?: number },
) {
  const state = await readModuleState();
  const module = state.modules.find(
    (existingModule) => existingModule.id === moduleId || existingModule.slug === moduleId,
  );

  if (!module) {
    return null;
  }

  if (typeof updates.blueprintId === "string" && updates.blueprintId.length > 0) {
    module.blueprintId = updates.blueprintId;
  }

  if (typeof updates.displayName === "string" && updates.displayName.length > 0) {
    module.displayName = updates.displayName;
  }

  if (typeof updates.status === "string" && updates.status.length > 0) {
    module.runtimeAttributes = {
      ...module.runtimeAttributes,
      status: updates.status,
    };
  }

  if (typeof updates.condition === "number" && Number.isFinite(updates.condition)) {
    module.runtimeAttributes = {
      ...module.runtimeAttributes,
      condition: updates.condition,
    };
  }

  await writeModuleState(state);
  return module;
}

export async function deleteModule(moduleId: string) {
  const state = await readModuleState();
  const nextModules = state.modules.filter(
    (module) => module.id !== moduleId && module.slug !== moduleId,
  );

  if (nextModules.length === state.modules.length) {
    return false;
  }

  await writeModuleState({
    ...state,
    modules: nextModules,
  });
  return true;
}

export function parseStarterModules(responseBody: unknown) {
  if (!isObject(responseBody) || !Array.isArray(responseBody.starterModules)) {
    return [];
  }

  const parsedModules = responseBody.starterModules
    .map(parseModule)
    .filter((module): module is HabitatModule => module !== null);

  return applyMissingSlugs(parsedModules);
}
