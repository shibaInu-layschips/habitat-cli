import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildModuleSlug,
  createModule,
  deleteModule,
  findStarterModuleByCapability,
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
let originalHabitatApiBaseUrl: string | undefined;
let originalBackendRuntime: string | undefined;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalHabitatApiBaseUrl = process.env.HABITAT_API_BASE_URL;
  originalBackendRuntime = process.env.HABITAT_BACKEND_RUNTIME;
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-modules-"));
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

  test("finds the starter suitport module by capability from the registration response", () => {
    const suitportModule = findStarterModuleByCapability(
      {
        starterModules: [
          {
            ...sampleModule,
            id: "habitat_1_command_module_1",
            capabilities: ["habitat-command"],
          },
          {
            id: "habitat_1_basic_suitport_1",
            blueprintId: "basic-suitport",
            displayName: "Basic Suitport",
            connectedTo: ["habitat_1_life_support_1"],
            runtimeAttributes: {
              health: 100,
              status: "online",
              evaStatus: "docked",
            },
            capabilities: ["limited-eva", "suitport-access"],
          },
        ],
      },
      "suitport-access",
    );

    expect(suitportModule?.id).toBe("habitat_1_basic_suitport_1");
    expect(suitportModule?.blueprintId).toBe("basic-suitport");
  });

  test("builds short slugs from blueprint ids", () => {
    expect(buildModuleSlug("command-module", 1)).toBe("command-module-1");
  });
});
