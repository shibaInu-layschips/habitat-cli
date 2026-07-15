import { Hono } from "hono";
import {
  countModules,
  createModule,
  deleteModule,
  getModule,
  readModuleState,
  updateModule,
  writeModuleState,
} from "./module-storage";
import { readConstructionState } from "./construction-storage";
import {
  addInventoryItem,
  readInventoryState,
  removeInventoryItem,
  spendInventoryResources,
  writeInventoryState,
} from "./inventory-storage";
import { listBlueprintCatalog, showBlueprintCatalogEntry } from "./kepler-blueprints";
import {
  ensureLocalModulesFromRegistration,
  readHabitatUuid,
  readRegistration,
  registerHabitat,
  unregisterHabitat,
} from "./kepler-registration";
import { listResourceCatalog } from "./kepler-resources";
import { readSolarIrradianceReading } from "./kepler-irradiance";
import { readWorldScan } from "./kepler-world-scan";
import { readSimulationState } from "./power-simulation";
import { readHumanState } from "./human-storage";
import { moveHuman } from "./human-behavior";
import { deployExplorer, dockExplorer, moveExplorer, readEvaState } from "./eva-state";

export const app = new Hono();

const habitatApiLogSummaries = new WeakMap<object, string>();

function setHabitatApiSummary(c: object, summary: string) {
  habitatApiLogSummaries.set(c, summary);
}

function respondJson(c: any, body: unknown, summary: string, status = 200) {
  setHabitatApiSummary(c, summary);
  return c.json(body, status);
}

function parseIntegerQuery(value: string | undefined) {
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

app.use("*", async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  await next();
  const summary = habitatApiLogSummaries.get(c);
  const suffix = typeof summary === "string" && summary.length > 0 ? summary : `${c.res.status}`;
  console.log(`[habitat-api] ${c.req.method} ${pathname} -> ${suffix}`);
});

app.get("/health", (c) => respondJson(c, { ok: true }, "ok"));

app.get("/registration", async (c) => {
  const registration = await readRegistration();

  if (!registration) {
    return respondJson(c, { registration: null }, "not registered");
  }

  return respondJson(c, {
    registration: {
      habitatUuid: readHabitatUuid(),
      habitatId: registration.habitatId,
      displayName: registration.habitatName,
      apiToken: process.env.KEPLER_PLANET_TOKEN?.trim() ?? null,
    },
  }, `registered as "${registration.habitatName}"`);
});

app.post("/registration", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const requestRecord = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const displayName =
    requestRecord && typeof requestRecord.displayName === "string"
      ? requestRecord.displayName.trim()
      : "";

  if (!displayName) {
    return respondJson(c, { error: "displayName is required." }, "registration request missing display name", 400);
  }

  try {
    const registration = await registerHabitat(displayName);

    return respondJson(c, {
      registration: {
        habitatUuid: readHabitatUuid(),
        habitatId: registration.habitatId,
        displayName: registration.habitatName,
        apiToken: process.env.KEPLER_PLANET_TOKEN?.trim() ?? null,
      },
    }, `registered "${registration.habitatName}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register habitat.";
    const status = message.includes("already registered") ? 409 : 500;
    return respondJson(c, { error: message }, "registration failed", status);
  }
});

app.delete("/registration", async (c) => {
  const removed = await unregisterHabitat();

  if (!removed) {
    return respondJson(c, {
      removed: false,
      registration: null,
    }, "no registration to remove");
  }

  return respondJson(c, {
    removed: true,
    registration: null,
  }, "registration removed");
});

app.get("/status", async (c) => {
  const registration = await readRegistration();
  await ensureLocalModulesFromRegistration(registration);
  const simulationState = await readSimulationState();
  const moduleCount = await countModules();

  if (!registration) {
    return respondJson(c, {
      currentTick: simulationState.currentTick,
      moduleCount,
      registration: null,
    }, `${moduleCount} modules, not registered`);
  }

  return respondJson(c, {
    currentTick: simulationState.currentTick,
    moduleCount,
    registration: {
      habitatUuid: readHabitatUuid(),
      habitatId: registration.habitatId,
      displayName: registration.habitatName,
      registeredAt: registration.registeredAt,
      status: registration.status,
      registrationId: registration.registrationId,
    },
  }, `${moduleCount} modules, registered as "${registration.habitatName}"`);
});

app.get("/state", async (c) => {
  const [modules, inventory, construction, simulation, registration, humans] = await Promise.all([
    readModuleState(),
    readInventoryState(),
    readConstructionState(),
    readSimulationState(),
    readRegistration(),
    readHumanState(),
  ]);

  return respondJson(c, {
    registration,
    modules,
    inventory,
    construction,
    simulation,
    humans,
  }, "snapshot returned");
});

app.get("/humans", async (c) => {
  const state = await readHumanState();
  return respondJson(c, state, `${state.humans.length} humans`);
});

app.put("/humans/:humanId", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const record = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const destinationModuleId = typeof record?.locationModuleId === "string" ? record.locationModuleId.trim() : "";

  if (!destinationModuleId) {
    return respondJson(c, { error: "locationModuleId is required." }, "human move missing destination", 400);
  }

  try {
    const human = await moveHuman(c.req.param("humanId"), destinationModuleId);
    return respondJson(c, { human }, `moved human "${human.id}" to "${human.locationModuleId}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to move human.";
    const status = message.startsWith("No human") || message.startsWith("No module") ? 404 : 409;
    return respondJson(c, { error: message }, "human move rejected", status);
  }
});

app.get("/eva/status", async (c) => {
  return respondJson(c, { eva: await readEvaState() }, "EVA status returned");
});

app.post("/eva/deploy", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const record = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const humanId = typeof record?.humanId === "string" ? record.humanId.trim() : "";

  if (!humanId) {
    return respondJson(c, { error: "humanId is required." }, "EVA deploy missing human", 400);
  }

  try {
    return respondJson(c, { eva: await deployExplorer(humanId) }, `EVA deployed human "${humanId}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to deploy explorer.";
    const status = message.startsWith("No human") ? 404 : 409;
    return respondJson(c, { error: message }, "EVA deploy rejected", status);
  }
});

app.post("/eva/move", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const record = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const x = typeof record?.x === "number" && Number.isInteger(record.x) ? record.x : null;
  const y = typeof record?.y === "number" && Number.isInteger(record.y) ? record.y : null;

  if (x === null || y === null) {
    return respondJson(c, { error: "x and y must be integers." }, "EVA move invalid coordinates", 400);
  }

  try {
    return respondJson(c, { eva: await moveExplorer(x, y) }, `EVA moved to (${x}, ${y})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to move explorer.";
    return respondJson(c, { error: message }, "EVA move rejected", 409);
  }
});

app.post("/eva/dock", async (c) => {
  try {
    return respondJson(c, { eva: await dockExplorer() }, "EVA docked");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to dock explorer.";
    return respondJson(c, { error: message }, "EVA dock rejected", 409);
  }
});

app.get("/modules", async (c) => {
  const state = await readModuleState();
  return respondJson(c, state, `${state.modules.length} modules`);
});
app.put("/modules", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  if (!requestBody || typeof requestBody !== "object") {
    return respondJson(c, { error: "Module state is required." }, "module state missing", 400);
  }

  await writeModuleState(requestBody as Awaited<ReturnType<typeof readModuleState>>);
  const state = await readModuleState();
  return respondJson(c, state, `saved ${state.modules.length} modules`);
});
app.get("/modules/:moduleId", async (c) => {
  const moduleId = c.req.param("moduleId");
  const module = await getModule(moduleId);

  if (!module) {
    return respondJson(c, { error: `No module with ID or short name "${moduleId}" was found.` }, "module not found", 404);
  }

  return respondJson(c, { module }, `found module "${module.slug}"`);
});

app.post("/modules", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  try {
    const module = await createModule(requestBody as Parameters<typeof createModule>[0]);
    return respondJson(c, { module }, `created module "${module.slug}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create module.";
    return respondJson(c, { error: message }, "module creation failed", 400);
  }
});

app.put("/modules/:moduleId", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const moduleId = c.req.param("moduleId");
  const updatedModule = await updateModule(moduleId, requestBody as Parameters<typeof updateModule>[1]);

  if (!updatedModule) {
    return respondJson(c, { error: `No module with ID or short name "${moduleId}" was found.` }, "module not found", 404);
  }

  return respondJson(c, { module: updatedModule }, `updated module "${updatedModule.slug}"`);
});

app.delete("/modules/:moduleId", async (c) => {
  const moduleId = c.req.param("moduleId");
  const module = await getModule(moduleId);

  if (module) {
    const humanState = await readHumanState();
    const occupied = humanState.humans.some(
      (human) => human.locationModuleId === module.id || human.locationModuleId === module.slug,
    );

    if (occupied) {
      return respondJson(c, { error: `Module "${moduleId}" cannot be deleted while humans are inside it.` }, "module deletion rejected", 409);
    }
  }

  const deleted = await deleteModule(moduleId);

  if (!deleted) {
    return respondJson(c, { error: `No module with ID or short name "${moduleId}" was found.` }, "module not found", 404);
  }

  return respondJson(c, { deleted: true }, `deleted module "${moduleId}"`);
});

app.get("/inventory", async (c) => {
  const state = await readInventoryState();
  return respondJson(c, state, `${state.items.length} inventory items`);
});
app.put("/inventory", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  if (!requestBody || typeof requestBody !== "object") {
    return respondJson(c, { error: "Inventory state is required." }, "inventory state missing", 400);
  }

  await writeInventoryState(requestBody as Awaited<ReturnType<typeof readInventoryState>>);
  const state = await readInventoryState();
  return respondJson(c, state, `saved ${state.items.length} inventory items`);
});
app.post("/inventory/add", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const record = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const resourceType = typeof record?.resourceType === "string" ? record.resourceType : "";
  const quantity = typeof record?.quantity === "number" ? record.quantity : NaN;
  const unit = typeof record?.unit === "string" && record.unit.length > 0 ? record.unit : "units";

  if (!resourceType || !Number.isFinite(quantity) || quantity <= 0) {
    return respondJson(c, { error: "resourceType and quantity are required." }, "inventory add missing fields", 400);
  }

  await addInventoryItem(resourceType, quantity, unit);
  const state = await readInventoryState();
  return respondJson(c, state, `added ${resourceType} x${quantity}`);
});

app.post("/inventory/remove", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const record = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const resourceType = typeof record?.resourceType === "string" ? record.resourceType : "";
  const quantity = typeof record?.quantity === "number" ? record.quantity : NaN;

  if (!resourceType || !Number.isFinite(quantity) || quantity <= 0) {
    return respondJson(c, { error: "resourceType and quantity are required." }, "inventory remove missing fields", 400);
  }

  const removed = await removeInventoryItem(resourceType, quantity);
  if (!removed) {
    return respondJson(c, { error: `No inventory item with resource type "${resourceType}" was found.` }, "inventory item not found", 404);
  }

  const state = await readInventoryState();
  return respondJson(c, state, `removed ${resourceType} x${quantity}`);
});

app.post("/inventory/spend", async (c) => {
  let requestBody: unknown = null;

  try {
    requestBody = await c.req.json();
  } catch {
    requestBody = null;
  }

  const record = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : null;
  const required = record && typeof record.required === "object" && record.required !== null ? record.required : null;

  if (!required) {
    return respondJson(c, { error: "required inventory resources are needed." }, "inventory spend missing fields", 400);
  }

  await spendInventoryResources(required as Record<string, number>);
  const state = await readInventoryState();
  return respondJson(c, state, "spent inventory for construction");
});
app.get("/construction", async (c) => respondJson(c, await readConstructionState(), "construction snapshot"));
app.get("/simulation", async (c) => respondJson(c, await readSimulationState(), "simulation snapshot"));

app.get("/catalog/blueprints", async (c) => {
  try {
    const blueprints = await listBlueprintCatalog();
    return respondJson(c, { blueprints }, "proxied to Kepler");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list catalog blueprints.";
    const status = message.includes("No Kepler blueprint") ? 404 : 502;
    return respondJson(c, { error: message }, "Kepler catalog lookup failed", status);
  }
});

app.get("/catalog/blueprints/:blueprintId", async (c) => {
  try {
    const blueprint = await showBlueprintCatalogEntry(c.req.param("blueprintId"));
    return respondJson(c, { blueprint }, "proxied to Kepler");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to show catalog blueprint.";
    const status = message.includes("No Kepler blueprint") ? 404 : 502;
    return respondJson(c, { error: message }, "Kepler catalog lookup failed", status);
  }
});

app.get("/catalog/resources", async (c) => {
  try {
    const resources = await listResourceCatalog();
    return respondJson(c, { resources }, "proxied to Kepler");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list catalog resources.";
    return respondJson(c, { error: message }, "Kepler catalog lookup failed", 502);
  }
});

app.get("/world/scan", async (c) => {
  const x = parseIntegerQuery(c.req.query("x"));
  const y = parseIntegerQuery(c.req.query("y"));
  const sensorStrength = parseIntegerQuery(c.req.query("sensorStrength"));
  const radius = parseIntegerQuery(c.req.query("radius"));

  if (
    x === null ||
    y === null ||
    sensorStrength === null ||
    sensorStrength < 0 ||
    sensorStrength > 100 ||
    radius === null ||
    radius < 0 ||
    radius > 5
  ) {
    return respondJson(c, { error: "x, y, sensorStrength, and radius must be valid numbers." }, "world scan query invalid", 400);
  }

  const registration = await readRegistration();

  if (!registration?.habitatId) {
    return respondJson(c, { error: "This habitat must be registered before scanning the world." }, "world scan unavailable", 409);
  }

  try {
    const scan = await readWorldScan({
      habitatId: registration.habitatId,
      x,
      y,
      sensorStrength,
      radius,
    });
    return respondJson(c, scan, "proxied to Kepler");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to scan the world.";
    return respondJson(c, { error: message }, "Kepler world scan failed", 502);
  }
});

app.get("/solar/irradiance", async (c) => {
  try {
    const solarIrradiance = await readSolarIrradianceReading();
    return respondJson(c, { solarIrradiance }, "proxied to Kepler");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read solar irradiance.";
    return respondJson(c, { error: message }, "Kepler solar lookup failed", 502);
  }
});
