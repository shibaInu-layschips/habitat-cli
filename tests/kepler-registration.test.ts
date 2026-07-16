import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHumanState } from "../src/human-storage";
import { readRegistration, registerHabitat } from "../src/kepler-registration";
import { readModuleState } from "../src/module-storage";

let originalCwd = "";
let workspaceDir = "";
let originalBaseUrl: string | undefined;
let originalPlanetToken: string | undefined;
let originalFetch: typeof globalThis.fetch;
let originalHabitatApiBaseUrl: string | undefined;
let originalBackendRuntime: string | undefined;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalBaseUrl = process.env.KEPLER_BASE_URL;
  originalPlanetToken = process.env.KEPLER_PLANET_TOKEN;
  originalFetch = globalThis.fetch;
  originalHabitatApiBaseUrl = process.env.HABITAT_API_BASE_URL;
  originalBackendRuntime = process.env.HABITAT_BACKEND_RUNTIME;

  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-registration-"));
  mkdirSync(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.env.KEPLER_BASE_URL = "https://planet.turingguild.com";
  process.env.KEPLER_PLANET_TOKEN = "test-token";
  process.env.HABITAT_BACKEND_RUNTIME = "1";
  delete process.env.HABITAT_API_BASE_URL;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env.KEPLER_BASE_URL = originalBaseUrl;
  process.env.KEPLER_PLANET_TOKEN = originalPlanetToken;
  process.env.HABITAT_API_BASE_URL = originalHabitatApiBaseUrl;
  process.env.HABITAT_BACKEND_RUNTIME = originalBackendRuntime;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("kepler registration", () => {
  test("preserves starter humans and the alert contract from the registration response", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          habitatId: "habitat-1",
          status: "registered",
          streamUrl: "wss://planet.turingguild.com/habitats/stream",
          apiToken: "habitat-stream-token",
          stream: {
            protocolVersion: "1",
            subscriptions: ["ticks"],
            currentTick: 12,
            ticksPerPulse: 5,
            status: "ready",
          },
          contracts: {
            alerts: {
              schemaVersion: "1.0",
              schema: {
                type: "object",
                required: ["id", "status"],
              },
            },
          },
          starterModules: [
            {
              id: "habitat_1_command_module_1",
              blueprintId: "command-module",
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "active",
              },
              capabilities: ["habitat-command"],
            },
            {
              id: "habitat_1_life_support_1",
              blueprintId: "life-support",
              displayName: "Life Support",
              connectedTo: ["habitat_1_basic_suitport_1"],
              runtimeAttributes: {
                health: 100,
                status: "active",
              },
              capabilities: ["atmosphere-control", "redundant-life-support"],
            },
            {
              id: "habitat_1_basic_battery_1",
              blueprintId: "basic-battery",
              displayName: "Basic Battery",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "offline",
              },
              capabilities: ["power-storage"],
            },
            {
              id: "habitat_1_supply_cache_1",
              blueprintId: "supply-cache",
              displayName: "Supply Cache",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "offline",
              },
              capabilities: ["storage"],
            },
            {
              id: "habitat_1_workshop_fabricator_1",
              blueprintId: "workshop-fabricator",
              displayName: "Workshop Fabricator",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "online",
              },
              capabilities: ["basic-fabrication"],
            },
            {
              id: "habitat_1_basic_suitport_1",
              blueprintId: "basic-suitport",
              displayName: "Basic Suitport",
              connectedTo: ["habitat_1_life_support_1"],
              runtimeAttributes: {
                health: 100,
                status: "online",
              },
              capabilities: ["limited-eva", "suitport-access"],
            },
          ],
          starterHumans: [
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
          ],
          blueprints: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await registerHabitat("Apollo");
    const registration = await readRegistration();
    const moduleState = await readModuleState();
    const humanState = await readHumanState();

    expect(registration?.starterHumans).toEqual([
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
    ]);
    expect(registration?.streamUrl).toBe("wss://planet.turingguild.com/habitats/stream");
    expect(registration?.apiToken).toBe("habitat-stream-token");
    expect(registration?.stream).toEqual({
      protocolVersion: "1",
      subscriptions: ["ticks"],
      currentTick: 12,
      ticksPerPulse: 5,
      status: "ready",
    });
    expect(registration?.alertContract).toEqual({
      schemaVersion: "1.0",
      schema: {
        type: "object",
        required: ["id", "status"],
      },
    });
    expect(moduleState.modules).toHaveLength(6);
    expect(moduleState.modules.map((module) => module.blueprintId)).toEqual([
      "command-module",
      "life-support",
      "basic-battery",
      "supply-cache",
      "workshop-fabricator",
      "basic-suitport",
    ]);
    expect(humanState.humans).toEqual([
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
    ]);
  });

  test("rolls back the local registration if starter humans cannot be fully persisted", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          habitatId: "habitat-1",
          status: "registered",
          contracts: {
            alerts: {
              schemaVersion: "1.0",
              schema: {
                type: "object",
              },
            },
          },
          starterModules: [
            {
              id: "habitat_1_command_module_1",
              blueprintId: "command-module",
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "active",
              },
              capabilities: ["habitat-command"],
            },
          ],
          starterHumans: [
            {
              id: "human-1",
              displayName: "Henry",
              locationModuleId: "habitat_1_command_module_1",
            },
            {
              id: "human-2",
              displayName: "Caroline",
            },
          ],
          blueprints: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await expect(registerHabitat("Apollo")).rejects.toThrow("Could not persist all starter humans from the registration response.");
    expect(await readRegistration()).toBeNull();
    expect((await readModuleState()).modules).toEqual([]);
    expect((await readHumanState()).humans).toEqual([]);
  });

  test("rolls back the local registration if starter modules cannot be fully persisted", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          habitatId: "habitat-1",
          status: "registered",
          contracts: {
            alerts: {
              schemaVersion: "1.0",
              schema: {
                type: "object",
              },
            },
          },
          starterModules: [
            {
              id: "habitat_1_command_module_1",
              blueprintId: "command-module",
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "active",
              },
              capabilities: ["habitat-command"],
            },
            {
              id: "habitat_1_life_support_1",
              blueprintId: "life-support",
              connectedTo: [],
              runtimeAttributes: {
                health: 100,
                status: "active",
              },
              capabilities: ["atmosphere-control"],
            },
          ],
          starterHumans: [
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
          ],
          blueprints: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await expect(registerHabitat("Apollo")).rejects.toThrow("Could not persist all starter modules from the registration response.");
    expect(await readRegistration()).toBeNull();
    expect((await readModuleState()).modules).toEqual([]);
    expect((await readHumanState()).humans).toEqual([]);
  });
});
