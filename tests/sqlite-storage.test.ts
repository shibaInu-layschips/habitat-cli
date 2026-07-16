import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHabitat } from "../src/kepler-registration";
import { hydrateModules, readModuleState } from "../src/module-storage";
import { hydrateInventory } from "../src/inventory-storage";
import { writeConstructionState } from "../src/construction-storage";
import { writeSimulationState } from "../src/power-simulation";
import { getSqliteDatabase } from "../src/sqlite-storage";
import type { HabitatModule } from "../src/types";

const sampleModule: HabitatModule = {
  id: "module-command",
  slug: "command-module-1",
  blueprintId: "command-module",
  displayName: "Command Module",
  connectedTo: [],
  runtimeAttributes: {
    status: "active",
    condition: 100,
  },
  capabilities: ["habitat-command"],
};

let originalCwd = "";
let workspaceDir = "";
let originalBaseUrl: string | undefined;
let originalPlanetToken: string | undefined;
let originalFetch: typeof globalThis.fetch;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalBaseUrl = process.env.KEPLER_BASE_URL;
  originalPlanetToken = process.env.KEPLER_PLANET_TOKEN;
  originalFetch = globalThis.fetch;

  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-sqlite-"));
  mkdirSync(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.env.KEPLER_BASE_URL = "https://planet.turingguild.com";
  process.env.KEPLER_PLANET_TOKEN = "test-token";
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env.KEPLER_BASE_URL = originalBaseUrl;
  process.env.KEPLER_PLANET_TOKEN = originalPlanetToken;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("sqlite storage", () => {
  test("runs additive migrations without removing existing state", () => {
    const database = getSqliteDatabase();
    database.query("INSERT INTO state_blobs (namespace, data) VALUES (?, ?)").run("registration", '{"apiToken":"stream-token"}');
    database.query("INSERT INTO state_blobs (namespace, data) VALUES (?, ?)").run("modules", '{"modules":[{"id":"module-1"}]}');

    expect(database.query("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([{ version: 1 }]);
    expect(database.query("SELECT data FROM state_blobs WHERE namespace = ?").get("registration")).toEqual({ data: '{"apiToken":"stream-token"}' });
    expect(database.query("SELECT data FROM state_blobs WHERE namespace = ?").get("modules")).toEqual({ data: '{"modules":[{"id":"module-1"}]}' });
    expect(database.query("SELECT mode FROM clock_state").get()).toEqual({ mode: "manual" });
  });

  test("stores active state in SQLite instead of JSON files", async () => {
    globalThis.fetch = async (input, init) => {
      expect(String(input)).toBe("https://planet.turingguild.com/habitats/register");
      expect(init?.method).toBe("POST");

      return new Response(
        JSON.stringify({
          registrationId: "registration-1",
          habitatId: "habitat-1",
          status: "registered",
          unregisterUrl: "https://planet.turingguild.com/habitats/register/registration-1",
          starterModules: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await registerHabitat("Apollo");
    await hydrateModules("habitat-1", [sampleModule]);
    await hydrateInventory([
      {
        resourceType: "ferrite",
        displayName: "Ferrite",
        quantity: 90,
        unit: "kg",
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
          remainingBuildTicks: 180,
          spentResources: { ferrite: 90 },
          runtimeAttributes: { status: "online", health: 100, powerGenerationKw: 12 },
          capabilities: ["solar-generation"],
          status: "active",
        },
      ],
    });
    await writeSimulationState({ currentTick: 42 });

    const moduleState = await readModuleState();
    expect(moduleState.modules).toHaveLength(1);
    expect(moduleState.modules[0]?.slug).toBe("command-module-1");

    const dbPath = join(workspaceDir, "habitat.sqlite");
    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(join(workspaceDir, ".habitat", "registration.json"))).toBe(false);
    expect(existsSync(join(workspaceDir, ".habitat", "identity.json"))).toBe(false);
    expect(existsSync(join(workspaceDir, ".habitat", "identity.previous.json"))).toBe(false);
    expect(existsSync(join(workspaceDir, ".habitat", "modules.json"))).toBe(false);
    expect(existsSync(join(workspaceDir, ".habitat", "inventory.json"))).toBe(false);
    expect(existsSync(join(workspaceDir, ".habitat", "construction.json"))).toBe(false);
    expect(existsSync(join(workspaceDir, ".habitat", "data.json"))).toBe(false);
  });
});
