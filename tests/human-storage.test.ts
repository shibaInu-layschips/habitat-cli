import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hydrateHumans, readHumanState } from "../src/human-storage";
import type { HabitatHuman } from "../src/types";

const sampleHumans: HabitatHuman[] = [
  {
    id: "human-1",
    displayName: "Henry",
    locationModuleId: "habitat_1_command_module_1",
  },
  {
    id: "human-2",
    displayName: "Caroline",
    locationModuleId: "habitat_1_command_module_1",
  },
];

let originalCwd = "";
let workspaceDir = "";
let originalHabitatApiBaseUrl: string | undefined;
let originalBackendRuntime: string | undefined;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalHabitatApiBaseUrl = process.env.HABITAT_API_BASE_URL;
  originalBackendRuntime = process.env.HABITAT_BACKEND_RUNTIME;
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-humans-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.env.HABITAT_BACKEND_RUNTIME = "1";
  delete process.env.HABITAT_API_BASE_URL;
});

afterEach(async () => {
  process.env.HABITAT_API_BASE_URL = originalHabitatApiBaseUrl;
  process.env.HABITAT_BACKEND_RUNTIME = originalBackendRuntime;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("human storage", () => {
  test("hydrates starter humans from the registration payload", async () => {
    await hydrateHumans("habitat-1", sampleHumans);

    const state = await readHumanState();

    expect(state.habitatId).toBe("habitat-1");
    expect(state.humans).toEqual(sampleHumans);
  });
});
