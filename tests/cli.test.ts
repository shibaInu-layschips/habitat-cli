import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHabitat } from "../src/cli";
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
      expect(String(input)).toBe("https://planet.turingguild.com/catalog/blueprints/basic-battery");

      return new Response(
        JSON.stringify({
          blueprint: {
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
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await runHabitat(["bun", "habitat", "blueprint", "show", "basic-battery"]);

    const joinedOutput = output.join("\n");
    expect(joinedOutput).toContain("Blueprint ID: basic-battery");
    expect(joinedOutput).toContain("Display Name: Basic Battery Blueprint");
    expect(joinedOutput).toContain("Build Ticks: 180");
    expect(joinedOutput).toContain('Inputs: {"ferrite":55}');
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
});
