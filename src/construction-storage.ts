import { getSqliteDatabaseFilePath, readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { ConstructionJob, ConstructionState } from "./types";

const CONSTRUCTION_STATE_NAMESPACE = "construction";

function defaultConstructionState(): ConstructionState {
  return {
    jobs: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStatus(value: unknown) {
  return value === "active" || value === "complete" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function asNumberRecord(value: unknown) {
  if (!isObject(value)) {
    return null;
  }

  const record: Record<string, number> = {};

  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount === "number" && Number.isFinite(amount)) {
      record[key] = amount;
    }
  }

  return record;
}

function parseConstructionJob(value: unknown): ConstructionJob | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asString(value.id);
  const blueprintId = asString(value.blueprintId);
  const outputModuleType = asString(value.outputModuleType);
  const outputDisplayName = asString(value.outputDisplayName);
  const facilityModuleSlug = asString(value.facilityModuleSlug);
  const startedAtTick = asNumber(value.startedAtTick);
  const remainingBuildTicks = asNumber(value.remainingBuildTicks);
  const spentResources = asNumberRecord(value.spentResources);
  const runtimeAttributes = isObject(value.runtimeAttributes) ? value.runtimeAttributes : null;
  const capabilities = asStringArray(value.capabilities);
  const status = asStatus(value.status);

  if (
    !id ||
    !blueprintId ||
    !outputModuleType ||
    !outputDisplayName ||
    !facilityModuleSlug ||
    startedAtTick === null ||
    remainingBuildTicks === null ||
    !spentResources ||
    !runtimeAttributes ||
    !capabilities ||
    !status
  ) {
    return null;
  }

  return {
    id,
    blueprintId,
    outputModuleType,
    outputDisplayName,
    facilityModuleSlug,
    startedAtTick,
    remainingBuildTicks,
    spentResources,
    runtimeAttributes,
    capabilities,
    status,
  };
}

function readConstructionStateBlob(): ConstructionState {
  const raw = readStateBlob(CONSTRUCTION_STATE_NAMESPACE);

  if (!raw) {
    return defaultConstructionState();
  }

  try {
    const parsed = JSON.parse(raw) as { jobs?: unknown };
    const jobs = Array.isArray(parsed.jobs)
      ? parsed.jobs.map(parseConstructionJob).filter((job): job is ConstructionJob => job !== null)
      : [];

    return {
      jobs,
    };
  } catch {
    return defaultConstructionState();
  }
}

function writeConstructionStateBlob(state: ConstructionState) {
  writeStateBlob(CONSTRUCTION_STATE_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

export function getConstructionFilePath() {
  return getSqliteDatabaseFilePath();
}

export async function readConstructionState(): Promise<ConstructionState> {
  return readConstructionStateBlob();
}

export async function writeConstructionState(state: ConstructionState) {
  writeConstructionStateBlob(state);
}

export async function createConstructionJob(job: ConstructionJob) {
  const state = readConstructionStateBlob();
  state.jobs.push(job);
  writeConstructionStateBlob(state);
}

export async function listActiveConstructionJobs() {
  const state = readConstructionStateBlob();
  return state.jobs.filter((job) => job.status === "active");
}

export async function findActiveJobByFacility(facilityModuleSlug: string) {
  const jobs = await listActiveConstructionJobs();
  return jobs.find((job) => job.facilityModuleSlug === facilityModuleSlug) ?? null;
}

export async function cancelActiveJobByFacility(facilityModuleSlug: string) {
  const state = readConstructionStateBlob();
  const activeJobIndex = state.jobs.findIndex(
    (job) => job.facilityModuleSlug === facilityModuleSlug && job.status === "active",
  );

  if (activeJobIndex === -1) {
    return null;
  }

  const [removedJob] = state.jobs.splice(activeJobIndex, 1);
  writeConstructionStateBlob(state);
  return removedJob ?? null;
}
