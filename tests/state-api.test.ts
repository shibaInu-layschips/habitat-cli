import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "../src/state-api";

let originalCwd = "";
let workspaceDir = "";
let originalBaseUrl: string | undefined;
let originalPlanetToken: string | undefined;
let originalFetch: typeof globalThis.fetch;
let originalLog: typeof console.log;

beforeEach(async () => {
  originalCwd = process.cwd();
  originalBaseUrl = process.env.KEPLER_BASE_URL;
  originalPlanetToken = process.env.KEPLER_PLANET_TOKEN;
  originalFetch = globalThis.fetch;
  originalLog = console.log;

  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-state-api-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  process.env.KEPLER_BASE_URL = "https://planet.turingguild.com";
  process.env.KEPLER_PLANET_TOKEN = "test-token";
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env.KEPLER_BASE_URL = originalBaseUrl;
  process.env.KEPLER_PLANET_TOKEN = originalPlanetToken;
  console.log = originalLog;
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("state api", () => {
  test("returns a friendly not-found response when no registration exists", async () => {
    const response = await app.fetch(new Request("http://localhost/registration"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ registration: null });
  });

  test("creates registration state through the backend", async () => {
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

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

    const response = await app.fetch(
      new Request("http://localhost/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Apollo" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      registration: {
        habitatUuid: expect.any(String),
        habitatId: "habitat-1",
        displayName: "Apollo",
        apiToken: "test-token",
      },
    });
    expect(logs.join("\n")).toContain('[kepler] POST /habitats/register -> 200');
    expect(logs.join("\n")).toContain('[habitat-api] POST /registration -> registered "Apollo"');
  });

  test("reports status from stored backend registration state", async () => {
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

    await app.fetch(
      new Request("http://localhost/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Apollo" }),
      }),
    );

    const response = await app.fetch(new Request("http://localhost/status"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currentTick: 0,
      moduleCount: 0,
      registration: {
        habitatUuid: expect.any(String),
        habitatId: "habitat-1",
        displayName: "Apollo",
        status: "registered",
        registrationId: "registration-1",
      },
    });
  });

  test("removes registration state through the backend", async () => {
    globalThis.fetch = async (input, init) => {
      const requestUrl = String(input);

      if (requestUrl === "https://planet.turingguild.com/habitats/register" && init?.method === "POST") {
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
      }

      if (requestUrl === "https://planet.turingguild.com/habitats/register/registration-1" && init?.method === "DELETE") {
        return new Response(null, { status: 200 });
      }

      throw new Error(`Unexpected request: ${requestUrl} ${init?.method ?? "GET"}`);
    };

    await app.fetch(
      new Request("http://localhost/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Apollo" }),
      }),
    );

    const deleteResponse = await app.fetch(new Request("http://localhost/registration", { method: "DELETE" }));
    expect(deleteResponse.status).toBe(200);
    expect(await deleteResponse.json()).toEqual({
      removed: true,
      registration: null,
    });

    const readBackResponse = await app.fetch(new Request("http://localhost/registration"));
    expect(await readBackResponse.json()).toEqual({ registration: null });
  });

  test("replaces module state through the backend", async () => {
    const response = await app.fetch(
      new Request("http://localhost/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          habitatId: "habitat-1",
          modules: [
            {
              id: "module-1",
              slug: "command-module-1",
              blueprintId: "command-module",
              displayName: "Command Module",
              connectedTo: [],
              runtimeAttributes: {
                status: "active",
                condition: 100,
              },
              capabilities: ["habitat-command"],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      habitatId: "habitat-1",
      modules: [
        {
          id: "module-1",
          slug: "command-module-1",
          blueprintId: "command-module",
          displayName: "Command Module",
        },
      ],
    });

    const readBackResponse = await app.fetch(new Request("http://localhost/modules"));
    expect(await readBackResponse.json()).toMatchObject({
      habitatId: "habitat-1",
      modules: [
        {
          id: "module-1",
          slug: "command-module-1",
          blueprintId: "command-module",
          displayName: "Command Module",
        },
      ],
    });
  });

  test("replaces inventory state through the backend", async () => {
    const response = await app.fetch(
      new Request("http://localhost/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              resourceType: "ferrite",
              displayName: "Ferrite",
              quantity: 90,
              unit: "kg",
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [
        {
          resourceType: "ferrite",
          displayName: "Ferrite",
          quantity: 90,
          unit: "kg",
        },
      ],
    });

    const readBackResponse = await app.fetch(new Request("http://localhost/inventory"));
    expect(await readBackResponse.json()).toEqual({
      items: [
        {
          resourceType: "ferrite",
          displayName: "Ferrite",
          quantity: 90,
          unit: "kg",
        },
      ],
    });
  });

  test("creates, updates, and deletes modules and inventory through the backend", async () => {
    const createModuleResponse = await app.fetch(
      new Request("http://localhost/modules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "module-workshop",
          slug: "workshop-fabricator-1",
          blueprintId: "workshop-fabricator",
          displayName: "Workshop Fabricator",
          connectedTo: [],
          runtimeAttributes: {
            status: "idle",
            condition: 92,
          },
          capabilities: ["fabrication"],
        }),
      }),
    );

    expect(createModuleResponse.status).toBe(200);
    expect(await createModuleResponse.json()).toEqual({
      module: {
        id: "module-workshop",
        slug: "workshop-fabricator-1",
        blueprintId: "workshop-fabricator",
        displayName: "Workshop Fabricator",
        connectedTo: [],
        runtimeAttributes: {
          status: "idle",
          condition: 92,
        },
        capabilities: ["fabrication"],
      },
    });

    const moduleReadResponse = await app.fetch(new Request("http://localhost/modules/workshop-fabricator-1"));
    expect(moduleReadResponse.status).toBe(200);
    expect(await moduleReadResponse.json()).toMatchObject({
      module: {
        slug: "workshop-fabricator-1",
        displayName: "Workshop Fabricator",
      },
    });

    const updateModuleResponse = await app.fetch(
      new Request("http://localhost/modules/workshop-fabricator-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "online",
        }),
      }),
    );
    expect(updateModuleResponse.status).toBe(200);
    expect(await updateModuleResponse.json()).toMatchObject({
      module: {
        slug: "workshop-fabricator-1",
        runtimeAttributes: {
          status: "online",
        },
      },
    });

    const addInventoryResponse = await app.fetch(
      new Request("http://localhost/inventory/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: "ferrite",
          quantity: 90,
          unit: "kg",
        }),
      }),
    );
    expect(addInventoryResponse.status).toBe(200);
    expect(await addInventoryResponse.json()).toMatchObject({
      items: [
        {
          resourceType: "ferrite",
          displayName: "Ferrite",
          quantity: 90,
          unit: "kg",
        },
      ],
    });

    const removeInventoryResponse = await app.fetch(
      new Request("http://localhost/inventory/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceType: "ferrite",
          quantity: 30,
        }),
      }),
    );
    expect(removeInventoryResponse.status).toBe(200);
    expect(await removeInventoryResponse.json()).toMatchObject({
      items: [
        {
          resourceType: "ferrite",
          quantity: 60,
        },
      ],
    });

    const spendInventoryResponse = await app.fetch(
      new Request("http://localhost/inventory/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          required: { ferrite: 60 },
        }),
      }),
    );
    expect(spendInventoryResponse.status).toBe(200);
    expect(await spendInventoryResponse.json()).toEqual({
      items: [
        {
          resourceType: "ferrite",
          displayName: "Ferrite",
          quantity: 0,
          unit: "kg",
        },
      ],
    });

    const deleteModuleResponse = await app.fetch(
      new Request("http://localhost/modules/workshop-fabricator-1", {
        method: "DELETE",
      }),
    );
    expect(deleteModuleResponse.status).toBe(200);
    expect(await deleteModuleResponse.json()).toEqual({ deleted: true });
  });

  test("proxies blueprint, resource, and solar reads through the backend", async () => {
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    const requests: string[] = [];
    globalThis.fetch = async (input) => {
      requests.push(String(input));

      if (String(input) === "https://planet.turingguild.com/catalog/blueprints") {
        return new Response(
          JSON.stringify({
            blueprints: [
              {
                id: "blueprint_1",
                blueprintId: "basic-battery",
                displayName: "Basic Battery",
                description: "Stores power.",
                status: "published",
                buildTicks: 180,
                inputs: { ferrite: 55 },
                output: { itemType: "module", moduleType: "basic-battery", quantity: 1 },
                prerequisites: [],
                capabilities: ["power-storage"],
                runtimeAttributes: { currentEnergyKwh: 500 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (String(input) === "https://planet.turingguild.com/catalog/blueprints/small-solar-array") {
        return new Response(
          JSON.stringify({
            blueprint: {
              id: "blueprint_2",
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
      }

      if (String(input) === "https://planet.turingguild.com/catalog/resources") {
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
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (String(input) === "https://planet.turingguild.com/world/solar-irradiance") {
        return new Response(
          JSON.stringify({
            solarIrradiance: {
              wPerM2: 912,
              condition: "clear",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected request: ${String(input)}`);
    };

    const blueprintsResponse = await app.fetch(new Request("http://localhost/catalog/blueprints"));
    expect(blueprintsResponse.status).toBe(200);
    expect(await blueprintsResponse.json()).toMatchObject({
      blueprints: [
        {
          blueprintId: "basic-battery",
          displayName: "Basic Battery",
        },
      ],
    });

    const blueprintResponse = await app.fetch(new Request("http://localhost/catalog/blueprints/small-solar-array"));
    expect(blueprintResponse.status).toBe(200);
    expect(await blueprintResponse.json()).toMatchObject({
      blueprint: {
        blueprintId: "small-solar-array",
        displayName: "Small Solar Array",
      },
    });

    const resourceResponse = await app.fetch(new Request("http://localhost/catalog/resources"));
    expect(resourceResponse.status).toBe(200);
    expect(await resourceResponse.json()).toMatchObject({
      resources: [
        {
          resourceType: "ferrite",
          displayName: "Ferrite",
        },
      ],
    });

    const solarResponse = await app.fetch(new Request("http://localhost/solar/irradiance"));
    expect(solarResponse.status).toBe(200);
    expect(await solarResponse.json()).toEqual({
      solarIrradiance: {
        wPerM2: 912,
        condition: "clear",
      },
    });

    expect(requests).toContain("https://planet.turingguild.com/catalog/blueprints");
    expect(requests).toContain("https://planet.turingguild.com/catalog/blueprints/small-solar-array");
    expect(requests).toContain("https://planet.turingguild.com/catalog/resources");
    expect(requests).toContain("https://planet.turingguild.com/world/solar-irradiance");
    expect(logs.join("\n")).toContain("[habitat-api] GET /catalog/blueprints -> proxied to Kepler");
    expect(logs.join("\n")).toContain("[kepler] GET /catalog/blueprints -> 200");
    expect(logs.join("\n")).toContain("[kepler] GET /world/solar-irradiance -> 200");
  });

  test("proxies world scan reads through the backend and injects habitatId", async () => {
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    globalThis.fetch = async (input, init) => {
      const requestUrl = new URL(String(input));

      if (requestUrl.toString() === "https://planet.turingguild.com/habitats/register") {
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
      }

      if (requestUrl.origin === "https://planet.turingguild.com" && requestUrl.pathname === "/world/scan") {
        expect(init?.method).toBe("GET");
        expect(requestUrl.searchParams.get("x")).toBe("12");
        expect(requestUrl.searchParams.get("y")).toBe("34");
        expect(requestUrl.searchParams.get("sensorStrength")).toBe("5");
        expect(requestUrl.searchParams.get("radiusTiles")).toBe("4");
        expect(requestUrl.searchParams.get("habitatId")).toBe("habitat-1");

        return new Response(
          JSON.stringify({
            scan: {
              resources: [
                {
                  resourceType: "ferrite",
                  quantity: 12,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected request: ${requestUrl.toString()} ${init?.method ?? "GET"}`);
    };

    await app.fetch(
      new Request("http://localhost/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Apollo" }),
      }),
    );

    const response = await app.fetch(
      new Request("http://localhost/world/scan?x=12&y=34&sensorStrength=5&radius=4"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      scan: {
        resources: [
          {
            resourceType: "ferrite",
            quantity: 12,
          },
        ],
      },
    });
    expect(logs.join("\n")).toContain("[habitat-api] GET /world/scan -> proxied to Kepler");
    expect(logs.join("\n")).toContain("[kepler] GET /world/scan -> 200");
  });

  test("validates world scan query parameters before calling Kepler", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("Unexpected network call");
    };

    const response = await app.fetch(
      new Request("http://localhost/world/scan?x=12&y=nope&sensorStrength=0&radius="),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "x, y, sensorStrength, and radius must be valid numbers.",
    });
    expect(fetchCalls).toBe(0);
  });

  test("logs each request", async () => {
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    const response = await app.fetch(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(logs.join("\n")).toContain("[habitat-api] GET /health -> ok");
  });
});
