import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHabitat } from "../src/cli";
import { hydrateInventory, readInventoryState } from "../src/inventory-storage";
import { readConstructionState, writeConstructionState } from "../src/construction-storage";
import { hydrateModules, readModuleState } from "../src/module-storage";
import type { HabitatModule } from "../src/types";

const workshopModule: HabitatModule = {
  id: "module-workshop",
  slug: "workshop-fabricator-1",
  blueprintId: "workshop-fabricator",
  displayName: "Workshop Fabricator",
  connectedTo: ["command-module-1"],
  runtimeAttributes: {
    condition: 92,
    status: "idle",
    powerDrawKw: {
      offline: 0,
      idle: 1,
      online: 1.25,
      active: 4,
      damaged: 6,
    },
  },
  capabilities: ["fabrication"],
};

const batteryModule: HabitatModule = {
  id: "module-battery",
  slug: "basic-battery-1",
  blueprintId: "basic-battery",
  displayName: "Basic Battery",
  connectedTo: ["command-module-1"],
  runtimeAttributes: {
    condition: 99,
    status: "active",
    currentEnergyKwh: 120,
    energyStorageKwh: 500,
    reserveKwh: 50,
    maxPowerOutputKw: 12,
    powerDrawKw: {
      offline: 0,
      idle: 0,
      online: 0,
      active: 0,
      damaged: 0,
    },
  },
  capabilities: ["power-storage"],
};

let originalCwd = "";
let workspaceDir = "";
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalExitCode: typeof process.exitCode;
let originalFetch: typeof globalThis.fetch;
let originalBaseUrl: string | undefined;
let originalPlanetToken: string | undefined;
let output: string[] = [];
let errors: string[] = [];

beforeEach(async () => {
  originalCwd = process.cwd();
  originalLog = console.log;
  originalError = console.error;
  originalExitCode = process.exitCode;
  originalFetch = globalThis.fetch;
  originalBaseUrl = process.env.KEPLER_BASE_URL;
  originalPlanetToken = process.env.KEPLER_PLANET_TOKEN;
  output = [];
  errors = [];

  console.log = (...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-cli-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.exitCode = undefined;
  process.env.KEPLER_BASE_URL = "https://planet.turingguild.com";
  process.env.KEPLER_PLANET_TOKEN = "test-token";
});

afterEach(async () => {
  console.log = originalLog;
  console.error = originalError;
  globalThis.fetch = originalFetch;
  process.env.KEPLER_BASE_URL = originalBaseUrl;
  process.env.KEPLER_PLANET_TOKEN = originalPlanetToken;
  process.exitCode = originalExitCode ?? 0;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("habitat CLI", () => {
  test("sets one module status and prints the power draw for that state", async () => {
    await hydrateModules("habitat-1", [workshopModule]);

    await runHabitat(["bun", "habitat", "module", "set-status", "workshop-fabricator-1", "active"]);

    const state = await readModuleState();
    const [storedModule] = state.modules;

    expect(storedModule).toEqual({
      ...workshopModule,
      runtimeAttributes: {
        ...workshopModule.runtimeAttributes,
        status: "active",
      },
    });
    expect(output.join("\n")).toContain('Set module "workshop-fabricator-1" status to active.');
    expect(output.join("\n")).toContain("Current Power Draw: 4 kW");
    expect(errors).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  test("rejects unsupported module statuses", async () => {
    await hydrateModules("habitat-1", [workshopModule]);

    await runHabitat(["bun", "habitat", "module", "set-status", "workshop-fabricator-1", "sleeping"]);

    const state = await readModuleState();
    const [storedModule] = state.modules;

    expect(storedModule?.runtimeAttributes.status).toBe("idle");
    expect(errors.join("\n")).toContain("Status must be one of: offline, idle, online, active, damaged.");
    expect(process.exitCode).toBe(1);
  });

  test("lists Kepler blueprints in a readable table", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints");
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");

      return new Response(
        JSON.stringify({
          blueprints: [
            {
              id: "blueprint_1",
              blueprintId: "basic-battery",
              displayName: "Basic Battery Blueprint",
              description: "Stores power.",
              status: "published",
              buildTicks: 180,
              inputs: { ferrite: 55 },
              output: { itemType: "module", moduleType: "basic-battery", quantity: 1 },
              prerequisites: [],
              capabilities: ["power-storage"],
              runtimeAttributes: { currentEnergyKwh: 500 },
            },
            {
              id: "blueprint_2",
              blueprintId: "basic-suitport",
              displayName: "Basic Suitport Blueprint",
              description: "Supports EVA access.",
              status: "published",
              buildTicks: 120,
              inputs: { ferrite: 45 },
              output: { itemType: "module", moduleType: "basic-suitport", quantity: 1 },
              prerequisites: ["life-support"],
              capabilities: ["limited-eva"],
              runtimeAttributes: { crewAccessCapacity: 1 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "blueprint", "list"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Kepler Blueprint Catalog");
    expect(joinedOutput).toContain("Blueprint ID");
    expect(joinedOutput).toContain("basic-battery");
    expect(joinedOutput).toContain("Basic Battery Blueprint");
    expect(joinedOutput).toContain("basic-suitport");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows one Kepler blueprint with readable details", async () => {
    globalThis.fetch = async (input) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints/small-solar-array");

      return new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "small-solar-array",
            displayName: "Small Solar Array",
            description: "Provides renewable surface power.",
            status: "published",
            buildTicks: 240,
            inputs: { ferrite: 80, photovoltaicCells: 24 },
            output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
            prerequisites: ["power-routing"],
            capabilities: ["surface-power-generation"],
            runtimeAttributes: {
              requiredFacility: "workshop-fabricator",
              maxPowerOutputKw: 18,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "blueprint", "show", "small-solar-array"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Blueprint ID: small-solar-array");
    expect(joinedOutput).toContain("Display Name: Small Solar Array");
    expect(joinedOutput).toContain("Build Ticks: 240");
    expect(joinedOutput).toContain("Required Resources");
    expect(joinedOutput).toContain("Resource           Amount");
    expect(joinedOutput).toContain("ferrite            80");
    expect(joinedOutput).toContain("photovoltaicCells  24");
    expect(joinedOutput).toContain("Required Facility: workshop-fabricator");
    expect(joinedOutput).toContain("Output Module Type: small-solar-array");
    expect(joinedOutput).toContain("Runtime Attributes");
    expect(joinedOutput).toContain("Attribute         Value");
    expect(joinedOutput).toContain("requiredFacility  workshop-fabricator");
    expect(joinedOutput).toContain("maxPowerOutputKw  18");
    expect(joinedOutput).toContain("Capabilities: surface-power-generation");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows one Kepler blueprint when the display name is used", async () => {
    globalThis.fetch = async (input) => {
      if (String(input) === "https://planet.turingguild.com/catalog/blueprints/Small%20Solar%20Array") {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "Missing" } }), {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "application/json" },
        });
      }

      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints");

      return new Response(
        JSON.stringify({
          blueprints: [
            {
              id: "blueprint_1",
              blueprintId: "small-solar-array",
              displayName: "Small Solar Array",
              description: "Provides renewable surface power.",
              status: "published",
              buildTicks: 240,
              inputs: { ferrite: 80, photovoltaicCells: 24 },
              output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
              prerequisites: ["power-routing"],
              capabilities: ["surface-power-generation"],
              runtimeAttributes: {
                requiredFacility: "workshop-fabricator",
                maxPowerOutputKw: 18,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "blueprint", "show", "Small Solar Array"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Blueprint ID: small-solar-array");
    expect(joinedOutput).toContain("Display Name: Small Solar Array");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows one Kepler blueprint when the display name is entered without quotes", async () => {
    globalThis.fetch = async (input) => {
      if (String(input).startsWith("https://planet.turingguild.com/catalog/blueprints/")) {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "Missing" } }), {
          status: 404,
          statusText: "Not Found",
          headers: { "Content-Type": "application/json" },
        });
      }

      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints");

      return new Response(
        JSON.stringify({
          blueprints: [
            {
              id: "blueprint_1",
              blueprintId: "small-solar-array",
              displayName: "Small Solar Array",
              description: "Provides renewable surface power.",
              status: "published",
              buildTicks: 240,
              inputs: { ferrite: 80, photovoltaicCells: 24 },
              output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
              prerequisites: ["power-routing"],
              capabilities: ["surface-power-generation"],
              runtimeAttributes: {
                requiredFacility: "workshop-fabricator",
                maxPowerOutputKw: 18,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "blueprint", "show", "small", "solar", "array"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Blueprint ID: small-solar-array");
    expect(joinedOutput).toContain("Display Name: Small Solar Array");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows a friendly error when a Kepler blueprint is missing", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: "not_found", message: "Missing" } }), {
        status: 404,
        statusText: "Not Found",
        headers: { "Content-Type": "application/json" },
      });

    await runHabitat(["bun", "habitat", "blueprint", "show", "missing-blueprint"]);

    expect(errors.join("\n")).toContain('No Kepler blueprint with ID "missing-blueprint" was found.');
    expect(process.exitCode).toBe(1);
  });

  test("lists Kepler resources in a readable table", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/resources");
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");

      return new Response(
        JSON.stringify({
          resources: [
            {
              id: "resource_1",
              resourceType: "ferrite",
              displayName: "Ferrite",
              kind: "material",
              rarity: "common",
              unit: "kg",
              description: "A structural metal resource.",
            },
            {
              id: "resource_2",
              resourceType: "rare-catalyst",
              displayName: "Rare Catalyst",
              kind: "chemical",
              rarity: "rare",
              unit: "kg",
              description: "Useful in high-end fabrication.",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "resource", "list"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Kepler Resource Catalog");
    expect(joinedOutput).toContain("Resource Type");
    expect(joinedOutput).toContain("Display Name");
    expect(joinedOutput).toContain("Ferrite");
    expect(joinedOutput).toContain("Rare Catalyst");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("lists local inventory items", async () => {
    await hydrateInventory([
      {
        resourceType: "ferrite",
        displayName: "Ferrite",
        quantity: 80,
        unit: "kg",
      },
      {
        resourceType: "photovoltaicCells",
        displayName: "Photovoltaic Cells",
        quantity: 24,
        unit: "parts",
      },
    ]);

    await runHabitat(["bun", "habitat", "inventory", "list"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Local Inventory");
    expect(joinedOutput).toContain("ferrite | Ferrite | 80 kg");
    expect(joinedOutput).toContain("photovoltaicCells | Photovoltaic Cells | 24 parts");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("lists local modules with labeled columns and power draw", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-command",
        slug: "command-module-1",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          condition: 100,
          powerDrawKw: {
            offline: 0,
            idle: 2,
            active: 2,
            damaged: 2,
          },
        },
        capabilities: ["habitat-command"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "offline",
          condition: 88,
          currentEnergyKwh: 120,
          energyStorageKwh: 500,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            active: 0,
            damaged: 0,
          },
        },
        capabilities: ["power-storage"],
      },
    ]);

    await runHabitat(["bun", "habitat", "module", "list"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Module");
    expect(joinedOutput).toContain("Display Name");
    expect(joinedOutput).toContain("Status");
    expect(joinedOutput).toContain("Condition");
    expect(joinedOutput).toContain("Power Draw (kW)");
    expect(joinedOutput).toContain("command-module-1");
    expect(joinedOutput).toContain("Command Module");
    expect(joinedOutput).toContain("2 kW");
    expect(joinedOutput).toContain("basic-battery-1");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows a power overview with state, effectiveness, draw, and generation", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-command",
        slug: "command-module-1",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          condition: 100,
          powerDrawKw: {
            offline: 0,
            idle: 2,
            active: 2,
            damaged: 2,
          },
        },
        capabilities: ["habitat-command"],
      },
      {
        id: "module-solar",
        slug: "small-solar-array-1",
        blueprintId: "small-solar-array",
        displayName: "Small Solar Array",
        connectedTo: [],
        runtimeAttributes: {
          status: "online",
          condition: 97,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            online: 0,
            active: 0,
            damaged: 0,
          },
          powerGenerationKw: 12,
        },
        capabilities: ["solar-generation"],
      },
    ]);

    await runHabitat(["bun", "habitat", "power", "overview"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Power Overview");
    expect(joinedOutput).toContain("Module");
    expect(joinedOutput).toContain("State");
    expect(joinedOutput).toContain("Effectiveness");
    expect(joinedOutput).toContain("Power Draw (kW)");
    expect(joinedOutput).toContain("Solar Generation (kW)");
    expect(joinedOutput).toContain("command-module-1");
    expect(joinedOutput).toContain("active");
    expect(joinedOutput).toContain("small-solar-array-1");
    expect(joinedOutput).toContain("online");
    expect(joinedOutput).toContain("12 kW");
    expect(joinedOutput).toContain("Total Power Draw");
    expect(joinedOutput).toContain("Total Solar Generation");
    expect(joinedOutput).toContain("Net Power");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows solar irradiance status from Kepler", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://planet.turingguild.com/world/solar-irradiance");
      expect(init?.method).toBe("GET");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");

      return new Response(
        JSON.stringify({
          solarIrradiance: {
            wPerM2: 912,
            condition: "clear",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "solar", "status"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Solar Status");
    expect(joinedOutput).toContain("Irradiance: 912 W/m^2");
    expect(joinedOutput).toContain("Condition: clear");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows a friendly empty state when no local inventory exists", async () => {
    await runHabitat(["bun", "habitat", "inventory", "list"]);

    expect(output.join("\n")).toContain("No local inventory recorded.");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("adds a local inventory item", async () => {
    await runHabitat(["bun", "habitat", "inventory", "add", "ferrite", "90"]);

    const state = await readInventoryState();

    expect(output.join("\n")).toContain('Added 90 of "ferrite" to local inventory.');
    expect(state.items).toEqual([
      {
        resourceType: "ferrite",
        displayName: "Ferrite",
        quantity: 90,
        unit: "units",
      },
    ]);
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("increments an existing local inventory item", async () => {
    await hydrateInventory([
      {
        resourceType: "ferrite",
        displayName: "Ferrite",
        quantity: 90,
        unit: "units",
      },
    ]);

    await runHabitat(["bun", "habitat", "inventory", "add", "ferrite", "10"]);

    const state = await readInventoryState();

    expect(state.items[0]?.quantity).toBe(100);
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("dry run reports construction readiness for a buildable blueprint", async () => {
    await hydrateModules("habitat-1", [
      {
        ...workshopModule,
        runtimeAttributes: {
          ...workshopModule.runtimeAttributes,
          status: "idle",
        },
      },
      {
        id: "module-supply-cache",
        slug: "supply-cache-1",
        blueprintId: "supply-cache",
        displayName: "Supply Cache",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
        },
        capabilities: ["storage"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          currentEnergyKwh: 120,
          energyStorageKwh: 500,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            active: 0,
            damaged: 0,
          },
        },
        capabilities: ["power-storage"],
      },
    ]);

    await hydrateInventory([
      {
        resourceType: "ferrite",
        displayName: "Ferrite",
        quantity: 90,
        unit: "kg",
      },
      {
        resourceType: "silicate-glass",
        displayName: "Silicate Glass",
        quantity: 45,
        unit: "kg",
      },
      {
        resourceType: "conductive-ore",
        displayName: "Conductive Ore",
        quantity: 18,
        unit: "kg",
      },
    ]);

    globalThis.fetch = async (input) => {
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints/small-solar-array");

      return new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "small-solar-array",
            displayName: "Small Solar Array Blueprint",
            description: "Starter solar power.",
            status: "published",
            buildTicks: 180,
            inputs: {
              ferrite: 90,
              "silicate-glass": 45,
              "conductive-ore": 18,
            },
            output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
            requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
            prerequisites: [],
            capabilities: ["solar-generation"],
            runtimeAttributes: {
              powerGenerationKw: 12,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "construct", "small-solar-array", "--dry-run"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Construction Dry Run");
    expect(joinedOutput).toContain("Blueprint: small-solar-array");
    expect(joinedOutput).toContain("Required Facility Exists: PASS");
    expect(joinedOutput).toContain("Fabricator Available: PASS");
    expect(joinedOutput).toContain("Supply Cache Online: PASS");
    expect(joinedOutput).toContain("Prerequisites Met: PASS");
    expect(joinedOutput).toContain("Inventory Enough: PASS");
    expect(joinedOutput).toContain("Module Would Create: small-solar-array");
    expect(joinedOutput).toContain('Resources Would Spend: {"ferrite":90,"silicate-glass":45,"conductive-ore":18}');
    expect(joinedOutput).toContain("Construction Can Start: YES");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("dry run fails when construction requirements are missing", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-supply-cache",
        slug: "supply-cache-1",
        blueprintId: "supply-cache",
        displayName: "Supply Cache",
        connectedTo: [],
        runtimeAttributes: {
          status: "offline",
        },
        capabilities: ["storage"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "offline",
          currentEnergyKwh: 0,
          energyStorageKwh: 500,
        },
        capabilities: ["power-storage"],
      },
    ]);

    await hydrateInventory([
      {
        resourceType: "ferrite",
        displayName: "Ferrite",
        quantity: 20,
        unit: "kg",
      },
    ]);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "small-solar-array",
            displayName: "Small Solar Array Blueprint",
            description: "Starter solar power.",
            status: "published",
            buildTicks: 180,
            inputs: {
              ferrite: 90,
              "silicate-glass": 45,
              "conductive-ore": 18,
            },
            output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
            requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
            prerequisites: [],
            capabilities: ["solar-generation"],
            runtimeAttributes: {
              powerGenerationKw: 12,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await runHabitat(["bun", "habitat", "construct", "small-solar-array", "--dry-run"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Required Facility Exists: FAIL");
    expect(joinedOutput).toContain("Fabricator Available: FAIL");
    expect(joinedOutput).toContain("Supply Cache Online: FAIL");
    expect(joinedOutput).toContain("Inventory Enough: FAIL");
    expect(joinedOutput).toContain("Module Would Create: small-solar-array");
    expect(joinedOutput).toContain('Resources Would Spend: {"ferrite":90,"silicate-glass":45,"conductive-ore":18}');
    expect(joinedOutput).toContain("Construction Can Start: NO");
    expect(process.exitCode).toBe(1);
  });

  test("starts local construction, spends inventory, and records a job", async () => {
    await hydrateModules("habitat-1", [
      {
        ...workshopModule,
        runtimeAttributes: {
          ...workshopModule.runtimeAttributes,
          status: "idle",
        },
      },
      {
        id: "module-supply-cache",
        slug: "supply-cache-1",
        blueprintId: "supply-cache",
        displayName: "Supply Cache",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
        },
        capabilities: ["storage"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          currentEnergyKwh: 120,
          energyStorageKwh: 500,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            active: 0,
            damaged: 0,
          },
        },
        capabilities: ["power-storage"],
      },
    ]);

    await hydrateInventory([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 90, unit: "kg" },
      { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 45, unit: "kg" },
      { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 18, unit: "kg" },
    ]);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "small-solar-array",
            displayName: "Small Solar Array Blueprint",
            description: "Starter solar power.",
            status: "published",
            buildTicks: 180,
            inputs: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
            output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
            requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
            prerequisites: [],
            capabilities: ["solar-generation"],
            runtimeAttributes: { powerGenerationKw: 12, status: "online" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await runHabitat(["bun", "habitat", "construct", "small-solar-array"]);

    const inventory = await readInventoryState();
    const construction = await readConstructionState();

    expect(output.join("\n")).toContain("Started Construction Job");
    expect(output.join("\n")).toContain("Module Will Create: small-solar-array");
    expect(output.join("\n")).toContain('Resources Spent: {"ferrite":90,"silicate-glass":45,"conductive-ore":18}');
    expect(inventory.items).toEqual([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 0, unit: "kg" },
      { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 0, unit: "kg" },
      { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 0, unit: "kg" },
    ]);
    expect(construction.jobs).toHaveLength(1);
    expect(construction.jobs[0]).toMatchObject({
      blueprintId: "small-solar-array",
      outputModuleType: "small-solar-array",
      facilityModuleSlug: "workshop-fabricator-1",
      remainingBuildTicks: 180,
      status: "active",
    });
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("rejects starting construction when the fabricator already has an active job", async () => {
    await hydrateModules("habitat-1", [
      workshopModule,
      {
        id: "module-supply-cache",
        slug: "supply-cache-1",
        blueprintId: "supply-cache",
        displayName: "Supply Cache",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
        },
        capabilities: ["storage"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
          currentEnergyKwh: 120,
          energyStorageKwh: 500,
        },
        capabilities: ["power-storage"],
      },
    ]);
    await hydrateInventory([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 90, unit: "kg" },
      { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 45, unit: "kg" },
      { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 18, unit: "kg" },
    ]);
    await writeConstructionState({
      jobs: [
        {
          id: "job-1",
          blueprintId: "water-recycler",
          outputModuleType: "water-recycler",
          outputDisplayName: "Water Recycler",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 0,
          remainingBuildTicks: 200,
          spentResources: { ferrite: 10 },
          runtimeAttributes: { status: "online", health: 100 },
          capabilities: ["water-recycling"],
          status: "active",
        },
      ],
    });

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "small-solar-array",
            displayName: "Small Solar Array Blueprint",
            description: "Starter solar power.",
            status: "published",
            buildTicks: 180,
            inputs: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
            output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
            requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
            prerequisites: [],
            capabilities: ["solar-generation"],
            runtimeAttributes: { powerGenerationKw: 12, status: "online" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await runHabitat(["bun", "habitat", "construct", "small-solar-array"]);

    expect(errors.join("\n")).toContain("workshop-fabricator-1 is already busy with another construction job.");
    expect(process.exitCode).toBe(1);
  });

  test("reports the real blocking reason when power is not usable", async () => {
    await hydrateModules("habitat-1", [
      workshopModule,
      {
        id: "module-supply-cache",
        slug: "supply-cache-1",
        blueprintId: "supply-cache",
        displayName: "Supply Cache",
        connectedTo: [],
        runtimeAttributes: {
          status: "active",
        },
        capabilities: ["storage"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          status: "offline",
          currentEnergyKwh: 120,
          energyStorageKwh: 500,
        },
        capabilities: ["power-storage"],
      },
    ]);
    await hydrateInventory([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 90, unit: "kg" },
      { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 45, unit: "kg" },
      { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 18, unit: "kg" },
    ]);

    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          blueprint: {
            id: "blueprint_1",
            blueprintId: "small-solar-array",
            displayName: "Small Solar Array Blueprint",
            description: "Starter solar power.",
            status: "published",
            buildTicks: 180,
            inputs: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
            output: { itemType: "module", moduleType: "small-solar-array", quantity: 1 },
            requiredFacility: { moduleType: "workshop-fabricator", minimumLevel: 1 },
            prerequisites: [],
            capabilities: ["solar-generation"],
            runtimeAttributes: { powerGenerationKw: 12, status: "online" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await runHabitat(["bun", "habitat", "construct", "small-solar-array"]);

    expect(errors.join("\n")).toContain("Construction also requires usable power.");
    expect(errors.join("\n")).toContain("basic-battery-1 is offline with 120 kWh available.");
    expect(errors.join("\n")).not.toContain("workshop-fabricator-1 is idle and available.");
    expect(process.exitCode).toBe(1);
  });

  test("shows a friendly empty state when no construction jobs exist", async () => {
    await runHabitat(["bun", "habitat", "construction", "status"]);

    expect(output.join("\n")).toContain("No local construction jobs found.");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows both active and completed construction jobs", async () => {
    await writeConstructionState({
      jobs: [
        {
          id: "job-active",
          blueprintId: "small-solar-array",
          outputModuleType: "small-solar-array",
          outputDisplayName: "Small Solar Array",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 10,
          remainingBuildTicks: 75,
          spentResources: { ferrite: 90, "silicate-glass": 45 },
          runtimeAttributes: { status: "online", health: 100 },
          capabilities: ["solar-generation"],
          status: "active",
        },
        {
          id: "job-complete",
          blueprintId: "water-recycler",
          outputModuleType: "water-recycler",
          outputDisplayName: "Water Recycler",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 0,
          remainingBuildTicks: 0,
          spentResources: { ferrite: 50 },
          runtimeAttributes: { status: "online", health: 100 },
          capabilities: ["water-recycling"],
          status: "complete",
        },
      ],
    });

    await runHabitat(["bun", "habitat", "construction", "status"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Construction Status");
    expect(joinedOutput).toContain("Job ID");
    expect(joinedOutput).toContain("Blueprint");
    expect(joinedOutput).toContain("Ticks Left");
    expect(joinedOutput).toContain("Spent Resources");
    expect(joinedOutput).toContain("job-active");
    expect(joinedOutput).toContain("small-solar-array");
    expect(joinedOutput).toContain("workshop-fabricator-1");
    expect(joinedOutput).toContain("active");
    expect(joinedOutput).toContain('{"ferrite":90,"silicate-glass":45}');
    expect(joinedOutput).toContain("job-complete");
    expect(joinedOutput).toContain("water-recycler");
    expect(joinedOutput).toContain("complete");
    expect(joinedOutput).toContain('{"ferrite":50}');
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("cancels an active construction job without refunding spent materials", async () => {
    await hydrateInventory([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 0, unit: "kg" },
      { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 0, unit: "kg" },
      { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 0, unit: "kg" },
    ]);
    await writeConstructionState({
      jobs: [
        {
          id: "job-active",
          blueprintId: "small-solar-array",
          outputModuleType: "small-solar-array",
          outputDisplayName: "Small Solar Array",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 10,
          remainingBuildTicks: 75,
          spentResources: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
          runtimeAttributes: { status: "online", health: 100, powerGenerationKw: 12 },
          capabilities: ["solar-generation"],
          status: "active",
        },
      ],
    });

    await runHabitat(["bun", "habitat", "construction", "cancel", "workshop-fabricator-1"]);

    const construction = await readConstructionState();
    const inventory = await readInventoryState();
    const modules = await readModuleState();
    const joinedOutput = output.join("\n");

    expect(joinedOutput).toContain('Canceled construction on "workshop-fabricator-1".');
    expect(joinedOutput).toContain("No module was created.");
    expect(joinedOutput).toContain("Spent materials were not refunded.");
    expect(construction.jobs).toEqual([]);
    expect(inventory.items).toEqual([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 0, unit: "kg" },
      { resourceType: "silicate-glass", displayName: "Silicate Glass", quantity: 0, unit: "kg" },
      { resourceType: "conductive-ore", displayName: "Conductive Ore", quantity: 0, unit: "kg" },
    ]);
    expect(modules.modules).toEqual([]);
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("reports a friendly error when no active construction job exists for the facility", async () => {
    await writeConstructionState({
      jobs: [
        {
          id: "job-complete",
          blueprintId: "water-recycler",
          outputModuleType: "water-recycler",
          outputDisplayName: "Water Recycler",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 0,
          remainingBuildTicks: 0,
          spentResources: { ferrite: 50 },
          runtimeAttributes: { status: "online", health: 100 },
          capabilities: ["water-recycling"],
          status: "complete",
        },
      ],
    });

    await runHabitat(["bun", "habitat", "construction", "cancel", "workshop-fabricator-1"]);

    const construction = await readConstructionState();

    expect(errors.join("\n")).toContain('No active construction job for facility "workshop-fabricator-1" was found.');
    expect(construction.jobs).toHaveLength(1);
    expect(construction.jobs[0]?.status).toBe("complete");
    expect(process.exitCode).toBe(1);
  });

  test("reports completed construction in tick output", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-command",
        slug: "command-module-1",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "active",
          powerDrawKw: {
            offline: 0,
            idle: 2,
            active: 2,
            damaged: 2,
          },
        },
        capabilities: ["habitat-command"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "active",
          currentEnergyKwh: 500,
          energyStorageKwh: 500,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            active: 0,
            damaged: 0,
          },
        },
        capabilities: ["power-storage"],
      },
    ]);
    await writeConstructionState({
      jobs: [
        {
          id: "job-1",
          blueprintId: "small-solar-array",
          outputModuleType: "small-solar-array",
          outputDisplayName: "Small Solar Array",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 0,
          remainingBuildTicks: 1,
          spentResources: { ferrite: 90 },
          runtimeAttributes: { status: "online", health: 100, powerGenerationKw: 12 },
          capabilities: ["solar-generation"],
          status: "active",
        },
      ],
    });

    await runHabitat(["bun", "habitat", "tick", "1"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Advanced 1 ticks.");
    expect(joinedOutput).toContain("Solar Generation: 0 kWh");
    expect(joinedOutput).toContain("No solar charging happened because no effectively generating solar modules were found.");
    expect(joinedOutput).toContain("Construction Completed: small-solar-array");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("reports solar charging in tick output", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-command",
        slug: "command-module-1",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "active",
          powerDrawKw: {
            offline: 0,
            idle: 2,
            active: 2,
            damaged: 2,
          },
        },
        capabilities: ["habitat-command"],
      },
      {
        ...batteryModule,
        runtimeAttributes: {
          ...batteryModule.runtimeAttributes,
          status: "active",
          currentEnergyKwh: 100,
          energyStorageKwh: 500,
        },
      },
      {
        id: "module-solar",
        slug: "small-solar-array-1",
        blueprintId: "small-solar-array",
        displayName: "Small Solar Array",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "online",
          powerGenerationKw: 12,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            active: 0,
            damaged: 0,
          },
        },
        capabilities: ["solar-generation"],
      },
    ]);

    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://planet.turingguild.com/world/solar-irradiance");
      expect(init?.method).toBe("GET");
      return new Response(
        JSON.stringify({
          solarIrradiance: {
            wPerM2: 900,
            condition: "clear",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "tick", "1", "hour"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Advanced 3600 ticks.");
    expect(joinedOutput).toContain("Battery Drain: 2 kWh");
    expect(joinedOutput).toContain("Solar Irradiance: 900 W/m^2 (clear)");
    expect(joinedOutput).toContain("Solar Generation: 6 kWh");
    expect(joinedOutput).toContain("Solar Charge Applied: 6 kWh");
    expect(joinedOutput).toContain("Solar charging generated 6 kWh and added 6 kWh to the battery.");
    expect(joinedOutput).toContain("Battery Remaining: 104 kWh / 500 kWh");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("accepts tick commands written as hours", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-command",
        slug: "command-module-1",
        blueprintId: "command-module",
        displayName: "Command Module",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "active",
          powerDrawKw: {
            offline: 0,
            idle: 2,
            active: 2,
            damaged: 2,
          },
        },
        capabilities: ["habitat-command"],
      },
      {
        id: "module-battery",
        slug: "basic-battery-1",
        blueprintId: "basic-battery",
        displayName: "Basic Battery",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "active",
          currentEnergyKwh: 500,
          energyStorageKwh: 500,
          powerDrawKw: {
            offline: 0,
            idle: 0,
            active: 0,
            damaged: 0,
          },
        },
        capabilities: ["power-storage"],
      },
    ]);

    await runHabitat(["bun", "habitat", "tick", "1", "hour"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Advanced 3600 ticks.");
    expect(joinedOutput).toContain("Tick Range: 0 -> 3600");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows a built solar array through the top-level alias command", async () => {
    await hydrateModules("habitat-1", [
      {
        id: "module-solar",
        slug: "small-solar-array-1",
        blueprintId: "small-solar-array",
        displayName: "Small Solar Array Blueprint",
        connectedTo: [],
        runtimeAttributes: {
          health: 100,
          status: "online",
          powerGenerationKw: 12,
        },
        capabilities: ["solar-generation"],
      },
    ]);

    await runHabitat(["bun", "habitat", "small-solar-array-1"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Module: small-solar-array-1");
    expect(joinedOutput).toContain("Blueprint ID: small-solar-array");
    expect(joinedOutput).toContain("Display Name: Small Solar Array Blueprint");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows detailed module info for a fabricator with an active construction job", async () => {
    await hydrateModules("habitat-1", [
      {
        ...workshopModule,
        runtimeAttributes: {
          ...workshopModule.runtimeAttributes,
          status: "idle",
        },
      },
      batteryModule,
    ]);
    await writeConstructionState({
      jobs: [
        {
          id: "job-active",
          blueprintId: "small-solar-array",
          outputModuleType: "small-solar-array",
          outputDisplayName: "Small Solar Array",
          facilityModuleSlug: "workshop-fabricator-1",
          startedAtTick: 10,
          remainingBuildTicks: 75,
          spentResources: { ferrite: 90, "silicate-glass": 45, "conductive-ore": 18 },
          runtimeAttributes: { status: "online", health: 100, powerGenerationKw: 12 },
          capabilities: ["solar-generation"],
          status: "active",
        },
      ],
    });

    await runHabitat(["bun", "habitat", "module", "info", "workshop-fabricator-1"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Module Info");
    expect(joinedOutput).toContain("Module: workshop-fabricator-1");
    expect(joinedOutput).toContain("Declared State: idle");
    expect(joinedOutput).toContain("Effective State: idle");
    expect(joinedOutput).toContain("Condition: 92");
    expect(joinedOutput).toContain("Capabilities: fabrication");
    expect(joinedOutput).toContain("Active Construction Job");
    expect(joinedOutput).toContain("Job ID: job-active");
    expect(joinedOutput).toContain("Blueprint: small-solar-array");
    expect(joinedOutput).toContain("Output Module: small-solar-array");
    expect(joinedOutput).toContain("Remaining Build Ticks: 75");
    expect(joinedOutput).toContain("ferrite: 90");
    expect(joinedOutput).toContain("conductive-ore: 18");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows battery details in module info", async () => {
    await hydrateModules("habitat-1", [batteryModule]);

    await runHabitat(["bun", "habitat", "module", "info", "basic-battery-1"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Module Info");
    expect(joinedOutput).toContain("Module: basic-battery-1");
    expect(joinedOutput).toContain("Battery Details");
    expect(joinedOutput).toContain("Current Energy: 120 kWh");
    expect(joinedOutput).toContain("Storage Capacity: 500 kWh");
    expect(joinedOutput).toContain("Reserve: 50 kWh");
    expect(joinedOutput).toContain("Max Power Output: 12 kW");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });

  test("shows important status details for one module", async () => {
    await hydrateModules("habitat-1", [
      {
        ...workshopModule,
        runtimeAttributes: {
          ...workshopModule.runtimeAttributes,
          status: "online",
        },
      },
    ]);

    await runHabitat(["bun", "habitat", "module", "workshop-fabricator-1", "status"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Module Status");
    expect(joinedOutput).toContain("Module: workshop-fabricator-1");
    expect(joinedOutput).toContain("Declared State: online");
    expect(joinedOutput).toContain("Effective State: online");
    expect(joinedOutput).toContain("Condition: 92");
    expect(joinedOutput).toContain("Current Power Draw: 1.25 kW");
    expect(joinedOutput).toContain("Capabilities: fabrication");
    expect(errors).toEqual([]);
    expect(process.exitCode).not.toBe(1);
  });
});
