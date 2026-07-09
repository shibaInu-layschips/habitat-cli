import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ConstructionJob, ConstructionState } from "./types";

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

async function ensureConstructionDir() {
  await mkdir(dirname(getConstructionFilePath()), { recursive: true });
}

export function getConstructionFilePath() {
  return join(process.cwd(), ".habitat", "construction.json");
}

export async function readConstructionState(): Promise<ConstructionState> {
  const constructionFilePath = getConstructionFilePath();

  if (!existsSync(constructionFilePath)) {
    return defaultConstructionState();
  }

  const raw = await readFile(constructionFilePath, "utf8");
  const parsed = JSON.parse(raw) as { jobs?: unknown };
  const jobs = Array.isArray(parsed.jobs)
    ? parsed.jobs.map(parseConstructionJob).filter((job): job is ConstructionJob => job !== null)
    : [];

  return {
    jobs,
  };
}

export async function writeConstructionState(state: ConstructionState) {
  await ensureConstructionDir();
  await writeFile(getConstructionFilePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function createConstructionJob(job: ConstructionJob) {
  const state = await readConstructionState();
  state.jobs.push(job);
  await writeConstructionState(state);
}

export async function listActiveConstructionJobs() {
  const state = await readConstructionState();
  return state.jobs.filter((job) => job.status === "active");
}

export async function findActiveJobByFacility(facilityModuleSlug: string) {
  const jobs = await listActiveConstructionJobs();
  return jobs.find((job) => job.facilityModuleSlug === facilityModuleSlug) ?? null;
}

export async function cancelActiveJobByFacility(facilityModuleSlug: string) {
  const state = await readConstructionState();
  const activeJobIndex = state.jobs.findIndex(
    (job) => job.facilityModuleSlug === facilityModuleSlug && job.status === "active",
  );

  if (activeJobIndex === -1) {
    return null;
  }

  const [removedJob] = state.jobs.splice(activeJobIndex, 1);
  await writeConstructionState(state);
  return removedJob ?? null;
}
