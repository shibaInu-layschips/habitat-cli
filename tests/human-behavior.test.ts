import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moveHuman } from "../src/human-behavior";
import { hydrateHumans, readHumanState } from "../src/human-storage";
import { hydrateModules } from "../src/module-storage";
import type { HabitatHuman, HabitatModule } from "../src/types";

const humans: HabitatHuman[] = [
  { id: "human-1", displayName: "Henry", locationModuleId: "module-a" },
  { id: "human-2", displayName: "Caroline", locationModuleId: "module-a" },
];

const modules: HabitatModule[] = [
  {
    id: "module-a",
    slug: "command-module-1",
    blueprintId: "command-module",
    displayName: "Command Module",
    connectedTo: [],
    runtimeAttributes: { status: "offline", crewCapacity: 2 },
    capabilities: [],
  },
  {
    id: "module-b",
    slug: "greenhouse-1",
    blueprintId: "greenhouse",
    displayName: "Greenhouse",
    connectedTo: [],
    runtimeAttributes: { status: "damaged", crewCapacity: 1 },
    capabilities: [],
  },
];

let originalCwd = "";
let workspaceDir = "";

beforeEach(async () => {
  originalCwd = process.cwd();
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-human-behavior-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.env.HABITAT_BACKEND_RUNTIME = "1";
  delete process.env.HABITAT_API_BASE_URL;
  await hydrateModules("habitat-1", modules);
  await hydrateHumans("habitat-1", humans);
});

afterEach(async () => {
  delete process.env.HABITAT_BACKEND_RUNTIME;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("human behavior", () => {
  test("moves a human to an existing destination with open crew capacity", async () => {
    await expect(moveHuman("human-1", "module-b")).resolves.toMatchObject({
      id: "human-1",
      locationModuleId: "module-b",
    });

    expect((await readHumanState()).humans).toEqual([
      { id: "human-1", displayName: "Henry", locationModuleId: "module-b" },
      { id: "human-2", displayName: "Caroline", locationModuleId: "module-a" },
    ]);
  });

  test("rejects a move when the destination has no open crew capacity", async () => {
    await expect(moveHuman("human-1", "module-b")).resolves.toBeTruthy();
    await expect(moveHuman("human-2", "module-b")).rejects.toThrow("crewCapacity");
  });

  test("rejects missing humans and destinations", async () => {
    await expect(moveHuman("missing-human", "module-b")).rejects.toThrow("human");
    await expect(moveHuman("human-1", "missing-module")).rejects.toThrow("module");
  });
});
