import { readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { HabitatHuman } from "./types";

const HUMANS_STATE_NAMESPACE = "humans";

export type HabitatHumanState = {
  habitatId: string | null;
  humans: HabitatHuman[];
};

function defaultHumanState(): HabitatHumanState {
  return {
    habitatId: null,
    humans: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseHuman(value: unknown): HabitatHuman | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asString(value.id);
  const displayName = asString(value.displayName);
  const locationModuleId = asString(value.locationModuleId);

  if (!id || !displayName || !locationModuleId) {
    return null;
  }

  return {
    id,
    displayName,
    locationModuleId,
  };
}

function readHumanStateBlob(): HabitatHumanState {
  const raw = readStateBlob(HUMANS_STATE_NAMESPACE);

  if (!raw) {
    return defaultHumanState();
  }

  try {
    const parsed = JSON.parse(raw) as { habitatId?: unknown; humans?: unknown };
    const habitatId = typeof parsed.habitatId === "string" ? parsed.habitatId : null;
    const humans = Array.isArray(parsed.humans)
      ? parsed.humans.map(parseHuman).filter((human): human is HabitatHuman => human !== null)
      : [];

    return {
      habitatId,
      humans,
    };
  } catch {
    return defaultHumanState();
  }
}

function writeHumanStateBlob(state: HabitatHumanState) {
  writeStateBlob(HUMANS_STATE_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

export async function readHumanState(): Promise<HabitatHumanState> {
  return readHumanStateBlob();
}

export async function writeHumanState(state: HabitatHumanState) {
  writeHumanStateBlob(state);
}

export async function hydrateHumans(habitatId: string | null, humans: HabitatHuman[]) {
  await writeHumanState({
    habitatId,
    humans,
  });
}
