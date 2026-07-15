import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectExplorer, deployExplorer, dockExplorer, moveExplorer, readEvaState } from "../src/eva-state";
import { hydrateHumans } from "../src/human-storage";
import { readInventoryState } from "../src/inventory-storage";
import { readHumanState } from "../src/human-storage";
import { hydrateModules } from "../src/module-storage";
import type { HabitatHuman, HabitatModule } from "../src/types";

const humans: HabitatHuman[] = [
  { id: "human-1", displayName: "Henry", locationModuleId: "habitat-suitport-1" },
  { id: "human-2", displayName: "Caroline", locationModuleId: "habitat-command-1" },
];

const modules: HabitatModule[] = [
  {
    id: "habitat-suitport-1",
    slug: "basic-suitport-1",
    blueprintId: "basic-suitport",
    displayName: "Basic Suitport",
    connectedTo: [],
    runtimeAttributes: { status: "active" },
    capabilities: ["suitport-access"],
  },
  {
    id: "habitat-command-1",
    slug: "command-module-1",
    blueprintId: "command-module",
    displayName: "Command Module",
    connectedTo: [],
    runtimeAttributes: { status: "active" },
    capabilities: [],
  },
];

let originalCwd = "";
let workspaceDir = "";
let originalBaseUrl: string | undefined;
let originalToken: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalBaseUrl = process.env.KEPLER_BASE_URL;
  originalToken = process.env.KEPLER_PLANET_TOKEN;
  originalFetch = globalThis.fetch;
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-eva-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.env.HABITAT_BACKEND_RUNTIME = "1";
  delete process.env.HABITAT_API_BASE_URL;
  process.env.KEPLER_BASE_URL = "https://planet.turingguild.com";
  process.env.KEPLER_PLANET_TOKEN = "test-token";
  globalThis.fetch = async () => new Response(JSON.stringify({ tiles: [] }), { status: 200 });
  await hydrateModules("habitat-1", modules);
  await hydrateHumans("habitat-1", humans);
});

afterEach(async () => {
  process.env.KEPLER_BASE_URL = originalBaseUrl;
  process.env.KEPLER_PLANET_TOKEN = originalToken;
  process.env.HABITAT_BACKEND_RUNTIME = undefined;
  globalThis.fetch = originalFetch;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("eva state", () => {
  test("deploys a human from the active suitport at the origin", async () => {
    await expect(deployExplorer("human-1")).resolves.toMatchObject({
      deployedHumanId: "human-1",
      x: 0,
      y: 0,
      maxCarryingCapacityKg: 20,
    });
  });

  test("moves exactly one cardinal tile and persists the position", async () => {
    await deployExplorer("human-1");

    await expect(moveExplorer(1, 0)).resolves.toMatchObject({ x: 1, y: 0 });
    await expect(moveExplorer(2, 1)).rejects.toThrow("one adjacent grid tile");
    await expect(moveExplorer(3, 0)).rejects.toThrow("one adjacent grid tile");

    expect(await readEvaState()).toMatchObject({ deployedHumanId: "human-1", x: 1, y: 0 });
  });

  test("rejects a Kepler sector boundary failure and only docks at origin", async () => {
    await deployExplorer("human-1");
    await expect(moveExplorer(0, 1)).resolves.toMatchObject({ x: 0, y: 1 });
    await expect(dockExplorer()).rejects.toThrow("(0, 0)");

    globalThis.fetch = async () => new Response(JSON.stringify({ error: "outside sector" }), { status: 400 });
    await expect(moveExplorer(0, 2)).rejects.toThrow("current Kepler sector");
  });

  test("docking at origin clears the deployed explorer state", async () => {
    await deployExplorer("human-1");
    globalThis.fetch = async () => new Response(JSON.stringify({ resourceType: "ferrite", quantityKg: 5 }), { status: 200 });
    await collectExplorer(5);

    await expect(dockExplorer()).resolves.toMatchObject({ deployedHumanId: null, x: 0, y: 0 });
    expect((await readEvaState()).carriedResources).toEqual({});
    expect((await readInventoryState()).items).toEqual([
      { resourceType: "ferrite", displayName: "Ferrite", quantity: 5, unit: "kg" },
    ]);
    expect((await readHumanState()).humans[0]?.locationModuleId).toBe("habitat-suitport-1");
  });

  test("does not save any dock changes when the suitport is unavailable", async () => {
    await deployExplorer("human-1");
    globalThis.fetch = async () => new Response(JSON.stringify({ resourceType: "ferrite", quantityKg: 5 }), { status: 200 });
    await collectExplorer(5);
    await hydrateModules("habitat-1", [modules[1]!]);

    await expect(dockExplorer()).rejects.toThrow("No active suitport module");
    expect((await readEvaState()).deployedHumanId).toBe("human-1");
    expect((await readEvaState()).carriedResources).toEqual({ ferrite: 5 });
    expect((await readInventoryState()).items).toEqual([]);
    expect((await readHumanState()).humans[0]?.locationModuleId).toBe("habitat-suitport-1");
  });

  test("collects at the saved explorer position and persists carried resources", async () => {
    await deployExplorer("human-1");
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://planet.turingguild.com/world/collect");
      expect(init?.method).toBe("POST");
      const headers = new Headers(init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer test-token");
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(String(init?.body))).toEqual({
        habitatId: "habitat-1",
        x: 0,
        y: 0,
        quantityKg: 5,
      });
      return new Response(JSON.stringify({ resourceType: "ferrite", quantityKg: 5 }), { status: 200 });
    };

    await expect(collectExplorer(5)).resolves.toMatchObject({ carriedResources: { ferrite: 5 } });
    expect((await readEvaState()).carriedResources).toEqual({ ferrite: 5 });
  });

  test("rejects collection without an explorer or enough carrying capacity", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ resourceType: "ferrite", quantityKg: 1 }), { status: 200 });
    };

    await expect(collectExplorer(1)).rejects.toThrow("No human is currently deployed.");
    expect(fetchCalls).toBe(0);

    await deployExplorer("human-1");
    await expect(collectExplorer(21)).rejects.toThrow("carrying capacity");
    expect(fetchCalls).toBe(0);
    await expect(collectExplorer(1.5)).rejects.toThrow("positive whole number");
    expect(fetchCalls).toBe(0);
  });

  test("does not change carried resources when Kepler rejects collection", async () => {
    await deployExplorer("human-1");
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "not enough material" }), { status: 409 });

    await expect(collectExplorer(5)).rejects.toThrow("Kepler world collection failed");
    expect((await readEvaState()).carriedResources).toEqual({});
  });

  test("does not change carried resources when the tile has no material", async () => {
    await deployExplorer("human-1");
    globalThis.fetch = async () => new Response(JSON.stringify({ resourceType: null, quantityKg: 0 }), { status: 200 });

    await expect(collectExplorer(5)).rejects.toThrow("invalid collection result");
    expect((await readEvaState()).carriedResources).toEqual({});
  });
});
