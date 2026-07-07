import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildModuleSlug,
  createModule,
  deleteModule,
  getModule,
  hydrateModules,
  listModules,
  parseStarterModules,
  readModuleState,
  updateModule,
} from "../src/module-storage";
import type { HabitatModule } from "../src/types";

const sampleModule: HabitatModule = {
  id: "module-1",
  slug: "command-module-1",
  blueprintId: "command-module",
  displayName: "Command Module",
  connectedTo: [],
  runtimeAttributes: {
    health: 100,
    status: "active",
  },
  capabilities: ["habitat-command"],
};

let originalCwd = "";
let workspaceDir = "";

beforeEach(async () => {
  originalCwd = process.cwd();
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-modules-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("module storage", () => {
  test("hydrates local modules from starter modules", async () => {
    await hydrateModules("habitat-1", [sampleModule]);

    const state = await readModuleState();

    expect(state.habitatId).toBe("habitat-1");
    expect(state.modules).toEqual([sampleModule]);
  });

  test("supports create list show update and delete", async () => {
    await createModule(sampleModule);

    expect(await listModules()).toEqual([sampleModule]);
    expect(await getModule("module-1")).toEqual(sampleModule);
    expect(await getModule("command-module-1")).toEqual(sampleModule);

    const updatedModule = await updateModule("module-1", {
      displayName: "Command Module Alpha",
      status: "damaged",
      condition: 87,
    });

    expect(updatedModule?.displayName).toBe("Command Module Alpha");
    expect(updatedModule?.runtimeAttributes.status).toBe("damaged");
    expect(updatedModule?.runtimeAttributes.condition).toBe(87);

    expect(await deleteModule("module-1")).toBe(true);
    expect(await getModule("module-1")).toBeNull();
    expect(await listModules()).toEqual([]);
  });

  test("parses starter modules from a registration response", () => {
    const parsedModules = parseStarterModules({
      starterModules: [
        {
          ...sampleModule,
          slug: undefined,
          id: "habitat_1_command_module_1",
        },
        {
          ...sampleModule,
          slug: undefined,
          id: "habitat_1_command_module_2",
          displayName: "Command Module B",
        },
      ],
    });

    expect(parsedModules[0]?.slug).toBe("command-module-1");
    expect(parsedModules[1]?.slug).toBe("command-module-2");
  });

  test("builds short slugs from blueprint ids", () => {
    expect(buildModuleSlug("command-module", 1)).toBe("command-module-1");
  });
});
