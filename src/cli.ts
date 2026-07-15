import { Command } from "commander";
import { evaluateConstructionDryRun } from "./construction-readiness";
import {
  cancelActiveJobByFacility,
  createConstructionJob,
  findActiveJobByFacility,
  readConstructionState,
} from "./construction-storage";
import {
  countModules,
  listModules,
} from "./module-storage";
import {
  findBatteryModule,
  getModulePowerDrawKw,
  readSimulationState,
  runPowerTicks,
} from "./power-simulation";
import { formatModuleListReport, formatModuleStatusReport } from "./module-status";
import { formatModuleInfo, formatModuleStatusDetails } from "./module-report";
import { formatPowerOverview } from "./power-overview";
import { formatSolarStatus } from "./solar-report";
import { formatBlueprintInputs, formatBlueprintList, formatBlueprintRuntimeAttributes } from "./blueprint-report";
import { formatConstructionStatus } from "./construction-report";
import { formatResourceList } from "./resource-report";
import { KeplerBlueprintNotFoundError, showBlueprintCatalogEntry, type KeplerBlueprint } from "./kepler-blueprints";
import type { KeplerResource } from "./kepler-resources";
import type { SolarIrradianceReading } from "./kepler-irradiance";
import { formatWorldScanDetail, formatWorldScanSummary } from "./world-scan-report";
import { ensureLocalModulesFromRegistration, readRegistration } from "./kepler-registration";
import {
  getHabitatApiJson,
  deleteHabitatApiJson,
  postHabitatApiJson,
  putHabitatApiJson,
  HabitatApiError,
  type HabitatInventoryStateResponse,
  type HabitatHumanStateResponse,
  type HabitatModuleDeleteResponse,
  type HabitatModuleMutationResponse,
  type HabitatModuleResponse,
  type HabitatModuleStateResponse,
  type HabitatBlueprintListResponse,
  type HabitatBlueprintResponse,
  type HabitatRegistrationResponse,
  type HabitatResourceListResponse,
  type HabitatStatusResponse,
  type HabitatSolarIrradianceResponse,
  type HabitatUnregisterResponse,
} from "./habitat-api-client";
import type { EvaState, HabitatHuman, HabitatModule } from "./types";

const allowedModuleStatuses = ["offline", "idle", "online", "active", "damaged"] as const;

function printModule(module: HabitatModule) {
  console.log(`Module: ${module.slug}`);
  console.log(`Kepler ID: ${module.id}`);
  console.log(`Blueprint ID: ${module.blueprintId}`);
  console.log(`Display Name: ${module.displayName}`);
  console.log(`Status: ${String(module.runtimeAttributes.status ?? "unknown")}`);
  console.log(`Condition: ${String(module.runtimeAttributes.condition ?? "unknown")}`);
  console.log(`Capabilities: ${module.capabilities.length > 0 ? module.capabilities.join(", ") : "None"}`);
  console.log(`Connected To: ${module.connectedTo.length > 0 ? module.connectedTo.join(", ") : "None"}`);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HabitatApiError) {
    const responseBody = error.responseBody;

    if (typeof responseBody === "object" && responseBody !== null) {
      const body = responseBody as Record<string, unknown>;
      if (typeof body.error === "string") {
        return body.error;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

async function readRemoteModule(moduleId: string) {
  const response = await getHabitatApiJson<HabitatModuleResponse>(`/modules/${encodeURIComponent(moduleId)}`);
  return response.module;
}

async function readRemoteModules() {
  const response = await getHabitatApiJson<HabitatModuleStateResponse>("/modules");
  return response.modules;
}

async function createRemoteModule(module: HabitatModule) {
  const response = await postHabitatApiJson<HabitatModuleMutationResponse>("/modules", module);
  return response.module;
}

async function updateRemoteModule(moduleId: string, updates: Record<string, unknown>) {
  const response = await putHabitatApiJson<HabitatModuleMutationResponse>(
    `/modules/${encodeURIComponent(moduleId)}`,
    updates,
  );
  return response.module;
}

async function deleteRemoteModule(moduleId: string) {
  const response = await deleteHabitatApiJson<HabitatModuleDeleteResponse>(`/modules/${encodeURIComponent(moduleId)}`);
  return response.deleted;
}

async function readRemoteInventoryItems() {
  const response = await getHabitatApiJson<HabitatInventoryStateResponse>("/inventory");
  return response.items;
}

async function readRemoteHumanState() {
  return await getHabitatApiJson<HabitatHumanStateResponse>("/humans");
}

async function moveRemoteHuman(humanId: string, destinationModuleId: string) {
  const response = await putHabitatApiJson<{ human: HabitatHuman }>(
    `/humans/${encodeURIComponent(humanId)}`,
    { locationModuleId: destinationModuleId },
  );
  return response.human;
}

async function readRemoteEvaState() {
  const response = await getHabitatApiJson<{ eva: EvaState }>("/eva/status");
  return response.eva;
}

async function deployRemoteExplorer(humanId: string) {
  const response = await postHabitatApiJson<{ eva: EvaState }>("/eva/deploy", { humanId });
  return response.eva;
}

async function moveRemoteExplorer(x: number, y: number) {
  const response = await postHabitatApiJson<{ eva: EvaState }>("/eva/move", { x, y });
  return response.eva;
}

async function dockRemoteExplorer() {
  const response = await postHabitatApiJson<{ eva: EvaState }>("/eva/dock", {});
  return response.eva;
}

function printEvaStatus(eva: EvaState) {
  console.log("EVA Status");
  console.log(`Explorer: ${eva.deployedHumanId ?? "None"}`);
  console.log(`Position: (${eva.x}, ${eva.y})`);
  console.log(`Maximum Carrying Capacity: ${formatNumber(eva.maxCarryingCapacityKg)} kg`);
  const carriedResources = Object.entries(eva.carriedResources);
  console.log(
    `Carried Resources: ${carriedResources.length === 0 ? "None" : carriedResources.map(([resource, quantity]) => `${resource} ${formatNumber(quantity)} kg`).join(", ")}`,
  );
}

async function addRemoteInventoryItem(resourceType: string, quantity: number) {
  return await postHabitatApiJson<HabitatInventoryStateResponse>("/inventory/add", {
    resourceType,
    quantity,
  });
}

async function removeRemoteInventoryItem(resourceType: string, quantity: number) {
  return await postHabitatApiJson<HabitatInventoryStateResponse>("/inventory/remove", {
    resourceType,
    quantity,
  });
}

function parseTickRequest(ticksArg: string, unitArg?: string) {
  const ticks = Number(ticksArg);

  if (!Number.isInteger(ticks) || ticks < 1) {
    return null;
  }

  if (unitArg === undefined) {
    return ticks;
  }

  if (unitArg === "hour" || unitArg === "hours") {
    return ticks * 3600;
  }

  return null;
}

function parseIntegerOption(value: string) {
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSensorStrength(value: string) {
  const parsed = parseIntegerOption(value);

  if (parsed === null || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function parseScanRadius(value: string) {
  const parsed = parseIntegerOption(value);

  if (parsed === null || parsed < 0 || parsed > 5) {
    return null;
  }

  return parsed;
}

function printBatteryModule(module: HabitatModule) {
  printModule(module);

  const runtimeAttributes = module.runtimeAttributes as Record<string, unknown>;
  const currentEnergy = typeof runtimeAttributes.currentEnergyKwh === "number" ? runtimeAttributes.currentEnergyKwh : 0;
  const storageEnergy = typeof runtimeAttributes.energyStorageKwh === "number" ? runtimeAttributes.energyStorageKwh : 0;
  const reserveEnergy = typeof runtimeAttributes.reserveKwh === "number" ? runtimeAttributes.reserveKwh : 0;
  const maxPowerOutput = typeof runtimeAttributes.maxPowerOutputKw === "number" ? runtimeAttributes.maxPowerOutputKw : 0;

  console.log(`Current Energy: ${formatNumber(currentEnergy)} kWh`);
  console.log(`Storage Capacity: ${formatNumber(storageEnergy)} kWh`);
  console.log(`Reserve: ${formatNumber(reserveEnergy)} kWh`);
  console.log(`Max Power Output: ${formatNumber(maxPowerOutput)} kW`);
}

function printBlueprint(blueprint: KeplerBlueprint) {
  const requiredFacility =
    blueprint.requiredFacility?.moduleType
      ? blueprint.requiredFacility.moduleType
      : typeof blueprint.runtimeAttributes.requiredFacility === "string"
        ? blueprint.runtimeAttributes.requiredFacility
      : "Unknown";
  const outputModuleType =
    typeof blueprint.output.moduleType === "string" ? blueprint.output.moduleType : "Unknown";

  console.log(`Blueprint ID: ${blueprint.blueprintId}`);
  console.log(`Catalog ID: ${blueprint.id}`);
  console.log(`Display Name: ${blueprint.displayName}`);
  console.log(`Status: ${blueprint.status || "unknown"}`);
  console.log(`Build Ticks: ${blueprint.buildTicks}`);
  console.log("Required Resources");
  console.log(formatBlueprintInputs(blueprint.inputs));
  console.log(`Required Facility: ${requiredFacility}`);
  console.log(`Output Module Type: ${outputModuleType}`);
  console.log("Runtime Attributes");
  console.log(formatBlueprintRuntimeAttributes(blueprint.runtimeAttributes));
  console.log(`Description: ${blueprint.description || "None"}`);
  console.log(
    `Prerequisites: ${blueprint.prerequisites.length > 0 ? blueprint.prerequisites.join(", ") : "None"}`,
  );
  console.log(
    `Capabilities: ${blueprint.capabilities.length > 0 ? blueprint.capabilities.join(", ") : "None"}`,
  );
  console.log(
    `Output: ${Object.keys(blueprint.output).length > 0 ? JSON.stringify(blueprint.output) : "{}"}`,
  );
}

function getConstructionFailureMessage(result: Awaited<ReturnType<typeof evaluateConstructionDryRun>>) {
  const blockingChecks = result.checks.filter((check) => !check.passed);

  if (blockingChecks.length === 0) {
    return result.startDetail;
  }

  return [result.startDetail, ...blockingChecks.map((check) => check.detail)].join(" ");
}

function printHabitatStatus(status: HabitatStatusResponse) {
  console.log("Habitat Status");
  console.log(`Current Tick: ${status.currentTick}`);
  console.log(`Module Count: ${status.moduleCount}`);

  if (!status.registration) {
    console.log("Registration: Not registered");
    console.log('Try: habitat register --name "Apollo 2.0"');
    return;
  }

  console.log(`Registration: Registered as "${status.registration.displayName}"`);
  console.log(`Registration Status: ${status.registration.status}`);
  console.log(`Registered At: ${status.registration.registeredAt}`);
  console.log(`Habitat ID: ${status.registration.habitatId ?? "Unknown"}`);
}

async function showLocalModuleById(id: string) {
  try {
    const module = await readRemoteModule(id);

    if (!module) {
      console.error(`No module with ID or short name "${id}" was found.`);
      process.exitCode = 1;
      return;
    }

    const activeJob = await findActiveJobByFacility(module.slug);
    console.log(formatModuleInfo(module, activeJob));
  } catch (error) {
    console.error(getApiErrorMessage(error, `No module with ID or short name "${id}" was found.`));
    process.exitCode = 1;
  }
}

async function showLocalModuleStatusById(id: string) {
  try {
    const module = await readRemoteModule(id);

    if (!module) {
      console.error(`No module with ID or short name "${id}" was found.`);
      process.exitCode = 1;
      return;
    }

    const activeJob = await findActiveJobByFacility(module.slug);
    console.log(formatModuleStatusDetails(module, activeJob));
  } catch (error) {
    console.error(getApiErrorMessage(error, `No module with ID or short name "${id}" was found.`));
    process.exitCode = 1;
  }
}

export async function runHabitat(argv: string[]) {
  const solarArrayAlias = argv[2];

  if (typeof solarArrayAlias === "string" && /^small-solar-array-\d+$/.test(solarArrayAlias)) {
    await showLocalModuleById(solarArrayAlias);
    return;
  }

  if (
    argv[2] === "module" &&
    typeof argv[3] === "string" &&
    argv[4] === "status" &&
    argv.length === 5 &&
    argv[3] !== "status"
  ) {
    await showLocalModuleStatusById(argv[3]);
    return;
  }

  const program = new Command();

  program
    .name("habitat")
    .description("Register this habitat through the backend and inspect habitat status.")
    .version("0.1.0")
    .showHelpAfterError();

  program.addHelpText(
    "beforeAll",
    `
Habitat CLI for this lab:
  register    Register this habitat through the backend
  status      Show habitat status
  scan        Scan nearby world resources through the backend
  unregister  Remove this habitat registration through the backend
  tick        Advance the habitat simulation and drain battery power
  blueprint   Read the Kepler blueprint catalog
  resource    Read the Kepler resource catalog
  module      Create, inspect, update, and delete local habitat modules
  human       List and manage habitat humans
  eva         Deploy and control the habitat explorer
  inventory   Inspect local habitat inventory
  construction Inspect local construction jobs
  battery     Show battery status
  power       Inspect habitat power usage and generation
  solar       Inspect solar irradiance status

Persistence:
  Active local student-side state is stored in:
    habitat.sqlite
`,
  );

  program.addHelpText(
    "after",
    `
Quick start:
  habitat --help
  habitat register --name "Apollo 2.0"
  habitat status
  habitat scan --strength 100 --radius 0
  habitat blueprint list
  habitat blueprint show basic-battery
  habitat resource list
  habitat tick 10
  habitat module list
  habitat human list
  habitat eva status
  habitat module info workshop-fabricator-1
  habitat module workshop-fabricator-1 status
  habitat inventory list
  habitat construction status
  habitat battery status
  habitat power overview
  habitat solar status
  habitat unregister

Environment:
  HABITAT_API_BASE_URL  Optional, defaults to http://localhost:8787
  KEPLER_BASE_URL       Needed for Kepler-backed catalog and simulation commands
  KEPLER_PLANET_TOKEN   Needed for Kepler-backed catalog and simulation commands
`,
  );

  program.configureOutput({
    outputError: (str, write) => write(str),
  });

  program
    .command("register")
    .description("Register this habitat.")
    .requiredOption("--name <name>", "habitat name to register")
    .action(async (options) => {
      try {
        const registrationResponse = await postHabitatApiJson<HabitatRegistrationResponse>("/registration", {
          displayName: options.name,
        });
        if (!registrationResponse.registration) {
          throw new Error("The backend did not return a registration.");
        }

        const status = await getHabitatApiJson<HabitatStatusResponse>("/status");
        console.log(`Registered habitat "${status.registration?.displayName ?? options.name}".`);
        printHabitatStatus(status);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to register habitat.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  program
    .command("status")
    .description("Show habitat status.")
    .action(async () => {
      try {
        const status = await getHabitatApiJson<HabitatStatusResponse>("/status");
        printHabitatStatus(status);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to show habitat status.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  program
    .command("scan")
    .description("Scan nearby world resources through the backend.")
    .requiredOption("--strength <0-100>", "effective sensor strength")
    .option("--radius <0-5>", "scan radius", "0")
    .option("--json", "print the complete JSON response")
    .action(async (options) => {
      const strength = parseSensorStrength(options.strength);
      const radius = parseScanRadius(options.radius);

      if (strength === null) {
        console.error("strength must be an integer between 0 and 100.");
        process.exitCode = 1;
        return;
      }

      if (radius === null) {
        console.error("radius must be an integer between 0 and 5.");
        process.exitCode = 1;
        return;
      }

      try {
        const response = await getHabitatApiJson<unknown>(
          `/world/scan?sensorStrength=${encodeURIComponent(String(strength))}&radius=${encodeURIComponent(String(radius))}`,
        );

        if (options.json) {
          console.log(JSON.stringify(response, null, 2));
          return;
        }

        console.log(radius === 0 ? formatWorldScanDetail(response) : formatWorldScanSummary(response));
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to scan the world.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  program
    .command("tick")
    .description("Advance the habitat simulation by a number of ticks.")
    .argument("<ticks>", "number of ticks to run")
    .argument("[unit]", "optional time unit, such as hour or hours")
    .action(async (ticksArg, unitArg) => {
      const ticks = parseTickRequest(ticksArg, unitArg);

      if (ticks === null) {
        console.error("Tick count must be a positive integer.");
        process.exitCode = 1;
        return;
      }

      try {
        const summary = await runPowerTicks(ticks);
        const batteryCapacity = summary.batteryModule.runtimeAttributes as Record<string, unknown>;
        const storageEnergy =
          typeof batteryCapacity.energyStorageKwh === "number" ? batteryCapacity.energyStorageKwh : 0;
        console.log(`Advanced ${summary.ticksApplied} ticks.`);
        console.log(`Tick Range: ${summary.startTick} -> ${summary.endTick}`);
        console.log(`Total Power Draw: ${formatNumber(summary.totalPowerDrawKw)} kW`);
        console.log(`Battery Drain: ${formatNumber(summary.batteryDrainKwh)} kWh`);
        console.log(`Battery Remaining: ${formatNumber(summary.batteryEnergyAfterKwh)} kWh / ${formatNumber(storageEnergy)} kWh`);
        if (summary.solarIrradianceWPerM2 !== null) {
          const conditionText = summary.solarCondition ? ` (${summary.solarCondition})` : "";
          console.log(`Solar Irradiance: ${formatNumber(summary.solarIrradianceWPerM2)} W/m^2${conditionText}`);
        }
        console.log(`Solar Generation: ${formatNumber(summary.solarGeneratedKwh)} kWh`);
        console.log(`Solar Charge Applied: ${formatNumber(summary.solarChargeAppliedKwh)} kWh`);
        console.log(summary.solarChargingReport);
        for (const job of summary.completedConstructionJobs) {
          console.log(`Construction Completed: ${job.outputModuleType}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to advance habitat ticks.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  program
    .command("unregister")
    .description("Remove this habitat registration.")
    .action(async () => {
      try {
        const removed = await deleteHabitatApiJson<HabitatUnregisterResponse>("/registration");

        if (!removed.removed) {
          console.log("This habitat is not currently registered.");
          return;
        }

        console.log("Removed habitat registration. The habitat is now ready to register again.");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to unregister habitat.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  const moduleCommand = program
    .command("module")
    .description("Manage local habitat module records.");

  const humanCommand = program
    .command("human")
    .description("Inspect and manage habitat humans.");

  const evaCommand = program
    .command("eva")
    .description("Deploy and control the habitat explorer.");

  const blueprintCommand = program
    .command("blueprint")
    .description("Read the blueprint catalog through the backend.");

  const resourceCommand = program
    .command("resource")
    .description("Read the resource catalog through the backend.");

  const inventoryCommand = program
    .command("inventory")
    .description("Inspect local habitat inventory.");

  humanCommand
    .command("move")
    .description("Move a human to a habitat module.")
    .argument("<human-id>", "human ID")
    .argument("<module-id>", "destination module ID or short name")
    .action(async (humanId, destinationModuleId) => {
      try {
        const human = await moveRemoteHuman(humanId, destinationModuleId);
        console.log(`Moved ${human.displayName} to ${human.locationModuleId}.`);
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to move human.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  humanCommand
    .command("list")
    .description("List humans and their assigned habitat modules.")
    .option("--json", "print the complete JSON response")
    .action(async (options) => {
      try {
        const humanState = await readRemoteHumanState();

        if (options.json) {
          console.log(JSON.stringify(humanState, null, 2));
          return;
        }

        const humans = humanState.humans;

        if (humans.length === 0) {
          console.log("No humans recorded.");
          return;
        }

        console.log("Humans");
        for (const human of humans) {
          console.log(`${human.id} | ${human.displayName} | ${human.locationModuleId}`);
        }
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to read humans.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  evaCommand
    .command("status")
    .description("Show the current EVA explorer state.")
    .action(async () => {
      try {
        printEvaStatus(await readRemoteEvaState());
      } catch (error) {
        console.error(getApiErrorMessage(error, "Unable to read EVA status."));
        process.exitCode = 1;
      }
    });

  evaCommand
    .command("deploy")
    .description("Deploy one human from the active suitport.")
    .argument("<human-id>", "human ID")
    .action(async (humanId) => {
      try {
        const eva = await deployRemoteExplorer(humanId);
        console.log(`Deployed ${eva.deployedHumanId} at (0, 0).`);
      } catch (error) {
        console.error(getApiErrorMessage(error, "Unable to deploy explorer."));
        process.exitCode = 1;
      }
    });

  evaCommand
    .command("move")
    .description("Move the explorer one adjacent grid tile.")
    .argument("<x>", "destination x coordinate")
    .argument("<y>", "destination y coordinate")
    .action(async (xArg, yArg) => {
      const x = parseIntegerOption(xArg);
      const y = parseIntegerOption(yArg);

      if (x === null || y === null) {
        console.error("x and y must be integers.");
        process.exitCode = 1;
        return;
      }

      try {
        const eva = await moveRemoteExplorer(x, y);
        console.log(`Explorer moved to (${eva.x}, ${eva.y}).`);
      } catch (error) {
        console.error(getApiErrorMessage(error, "Unable to move explorer."));
        process.exitCode = 1;
      }
    });

  evaCommand
    .command("dock")
    .description("Dock the explorer at (0, 0).")
    .action(async () => {
      try {
        await dockRemoteExplorer();
        console.log("Explorer docked at (0, 0).");
      } catch (error) {
        console.error(getApiErrorMessage(error, "Unable to dock explorer."));
        process.exitCode = 1;
      }
    });

  const constructionCommand = program
    .command("construction")
    .description("Inspect local construction jobs.");

  const constructCommand = program
    .command("construct")
    .description("Validate or start local module construction.");

  const batteryCommand = program
    .command("battery")
    .description("Inspect the habitat battery.");

  const powerCommand = program
    .command("power")
    .description("Inspect habitat power usage and generation.");

  const solarCommand = program
    .command("solar")
    .description("Inspect solar irradiance through the backend.");

  blueprintCommand
    .command("list")
    .description("List blueprint catalog entries through the backend.")
    .action(async () => {
      try {
        const response = await getHabitatApiJson<HabitatBlueprintListResponse>("/catalog/blueprints");
        const blueprints = response.blueprints as KeplerBlueprint[];

        if (blueprints.length === 0) {
          console.log("No Kepler blueprint catalog entries were returned.");
          return;
        }

        console.log("Kepler Blueprint Catalog");
        console.log(formatBlueprintList(blueprints));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to list blueprint catalog entries.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  blueprintCommand
    .command("show")
    .description("Show one blueprint catalog entry through the backend.")
    .argument("<blueprint-id...>", "blueprint ID or display name")
    .action(async (blueprintIdParts: string[]) => {
      try {
        const blueprintId = blueprintIdParts.join(" ");
        const response = await getHabitatApiJson<HabitatBlueprintResponse>(
          `/catalog/blueprints/${encodeURIComponent(blueprintId)}`,
        );
        printBlueprint(response.blueprint as KeplerBlueprint);
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to show blueprint.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  resourceCommand
    .command("list")
    .description("List resource catalog entries through the backend.")
    .action(async () => {
      try {
        const response = await getHabitatApiJson<HabitatResourceListResponse>("/catalog/resources");
        const resources = response.resources as KeplerResource[];

        if (resources.length === 0) {
          console.log("No Kepler resource catalog entries were returned.");
          return;
        }

        console.log("Kepler Resource Catalog");
        console.log(formatResourceList(resources));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to list resource catalog entries.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  inventoryCommand
    .command("list")
    .description("List local habitat inventory.")
    .action(async () => {
      try {
        const items = await readRemoteInventoryItems();

        if (items.length === 0) {
          console.log("No local inventory recorded.");
          return;
        }

        console.log("Local Inventory");

        for (const item of items) {
          console.log(`${item.resourceType} | ${item.displayName} | ${formatNumber(item.quantity)} ${item.unit}`);
        }
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to read inventory.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  inventoryCommand
    .command("add")
    .description("Add one local inventory resource amount.")
    .argument("<resource-type>", "resource type")
    .argument("<quantity>", "resource quantity")
    .action(async (resourceType, quantityArg) => {
      const quantity = Number(quantityArg);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        console.error("Quantity must be a positive number.");
        process.exitCode = 1;
        return;
      }

      try {
        await addRemoteInventoryItem(resourceType, quantity);
        console.log(`Added ${formatNumber(quantity)} of "${resourceType}" to local inventory.`);
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to add inventory item.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  inventoryCommand
    .command("remove")
    .description("Remove one local inventory resource amount.")
    .argument("<resource-type>", "resource type")
    .argument("<quantity>", "resource quantity")
    .action(async (resourceType, quantityArg) => {
      const quantity = Number(quantityArg);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        console.error("Quantity must be a positive number.");
        process.exitCode = 1;
        return;
      }

      try {
        await removeRemoteInventoryItem(resourceType, quantity);
        console.log(`Removed ${formatNumber(quantity)} of "${resourceType}" from local inventory.`);
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to remove inventory item.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  constructionCommand
    .command("status")
    .description("Show local construction job status.")
    .action(async () => {
      const state = await readConstructionState();

      if (state.jobs.length === 0) {
        console.log("No local construction jobs found.");
        return;
      }

      console.log("Construction Status");
      console.log(formatConstructionStatus(state.jobs));
    });

  constructionCommand
    .command("cancel")
    .description("Cancel the active construction job for one facility.")
    .argument("<facility-module-slug>", "facility module slug")
    .action(async (facilityModuleSlug) => {
      const canceledJob = await cancelActiveJobByFacility(facilityModuleSlug);

      if (!canceledJob) {
        console.error(`No active construction job for facility "${facilityModuleSlug}" was found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Canceled construction on "${facilityModuleSlug}".`);
      console.log("No module was created.");
      console.log("Spent materials were not refunded.");
    });

  constructCommand
    .argument("<blueprint-id>", "blueprint ID")
    .option("--dry-run", "check whether local construction can start without changing state")
    .action(async (blueprintId, options) => {
      try {
        const registration = await readRegistration();
        await ensureLocalModulesFromRegistration(registration);
        const blueprint = await showBlueprintCatalogEntry(blueprintId);
        const result = await evaluateConstructionDryRun(blueprint);
        const outputModuleType =
          typeof result.blueprint.output.moduleType === "string"
            ? result.blueprint.output.moduleType
            : "Unknown";
        const resourcesWouldSpend =
          Object.keys(result.blueprint.inputs).length > 0 ? JSON.stringify(result.blueprint.inputs) : "{}";

        if (options.dryRun) {
          console.log("Construction Dry Run");
          console.log(`Blueprint: ${result.blueprint.blueprintId}`);
          console.log(`${result.requiredFacilityExists.label}: ${result.requiredFacilityExists.passed ? "PASS" : "FAIL"} - ${result.requiredFacilityExists.detail}`);
          console.log(`${result.fabricatorAvailable.label}: ${result.fabricatorAvailable.passed ? "PASS" : "FAIL"} - ${result.fabricatorAvailable.detail}`);
          console.log(`${result.supplyCacheOnline.label}: ${result.supplyCacheOnline.passed ? "PASS" : "FAIL"} - ${result.supplyCacheOnline.detail}`);
          console.log(`${result.prerequisitesMet.label}: ${result.prerequisitesMet.passed ? "PASS" : "FAIL"} - ${result.prerequisitesMet.detail}`);
          console.log(`${result.inventoryEnough.label}: ${result.inventoryEnough.passed ? "PASS" : "FAIL"} - ${result.inventoryEnough.detail}`);
          console.log(`Module Would Create: ${outputModuleType}`);
          console.log(`Resources Would Spend: ${resourcesWouldSpend}`);
          console.log(`Construction Can Start: ${result.canStart ? "YES" : "NO"} - ${result.startDetail}`);

          if (!result.canStart) {
            process.exitCode = 1;
          }
          return;
        }

        if (!result.canStart || !result.facilityModuleSlug) {
          console.error(getConstructionFailureMessage(result));
          process.exitCode = 1;
          return;
        }

        const simulationState = await readSimulationState();
        const job = {
          id: crypto.randomUUID(),
          blueprintId: result.blueprint.blueprintId,
          outputModuleType,
          outputDisplayName: result.blueprint.displayName,
          facilityModuleSlug: result.facilityModuleSlug,
          startedAtTick: simulationState.currentTick,
          remainingBuildTicks: result.blueprint.buildTicks,
          spentResources: result.blueprint.inputs as Record<string, number>,
          runtimeAttributes: {
            ...result.blueprint.runtimeAttributes,
            status:
              typeof result.blueprint.runtimeAttributes.status === "string"
                ? result.blueprint.runtimeAttributes.status
                : "online",
            health:
              typeof result.blueprint.runtimeAttributes.health === "number"
                ? result.blueprint.runtimeAttributes.health
                : 100,
          },
          capabilities: result.blueprint.capabilities,
          status: "active" as const,
        };
        await postHabitatApiJson<HabitatInventoryStateResponse>("/inventory/spend", {
          required: result.blueprint.inputs,
        });
        await createConstructionJob(job);
        console.log("Started Construction Job");
        console.log(`Job ID: ${job.id}`);
        console.log(`Module Will Create: ${job.outputModuleType}`);
        console.log(`Resources Spent: ${JSON.stringify(job.spentResources)}`);
        console.log(`Remaining Build Ticks: ${job.remainingBuildTicks}`);
      } catch (error) {
        const message =
          error instanceof KeplerBlueprintNotFoundError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to evaluate construction readiness.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  batteryCommand
    .command("status")
    .description("Show battery status.")
    .action(async () => {
      const registration = await readRegistration();
      await ensureLocalModulesFromRegistration(registration);
      const modules = await listModules();
      const batteryModule = findBatteryModule(modules);

      if (!batteryModule) {
        console.error('No battery module was found. Register the habitat first, then run "habitat battery status".');
        process.exitCode = 1;
        return;
      }

      console.log("Battery Status");
      printBatteryModule(batteryModule);
    });

  powerCommand
    .command("overview")
    .description("Show a local habitat power overview.")
    .action(async () => {
      const registration = await readRegistration();
      await ensureLocalModulesFromRegistration(registration);
      const modules = await listModules();

      if (modules.length === 0) {
        console.log("No local habitat modules found.");
        return;
      }

      console.log("Power Overview");
      console.log(formatPowerOverview(modules));
    });

  solarCommand
    .command("status")
    .description("Show solar irradiance status through the backend.")
    .action(async () => {
      try {
        const response = await getHabitatApiJson<HabitatSolarIrradianceResponse>("/solar/irradiance");
        const reading = response.solarIrradiance as SolarIrradianceReading | null;

        if (!reading) {
          console.error("No usable solar irradiance was returned by Kepler.");
          process.exitCode = 1;
          return;
        }

        console.log(formatSolarStatus(reading));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to read solar irradiance.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("create")
    .description("Create a local habitat module.")
    .argument("<id>", "module ID")
    .requiredOption("--blueprint-id <blueprintId>", "source blueprint ID")
    .requiredOption("--display-name <displayName>", "human-friendly module name")
    .option("--status <status>", "initial runtime status", "idle")
    .action(async (id, options) => {
      try {
        const createdModule = await createRemoteModule({
          id,
          slug: id,
          blueprintId: options.blueprintId,
          displayName: options.displayName,
          connectedTo: [],
          runtimeAttributes: {
            health: 100,
            status: options.status,
          },
          capabilities: [],
        });
        if (!createdModule) {
          throw new Error("The backend did not create a module.");
        }
        console.log(`Created module "${createdModule.slug}".`);
        printModule(createdModule);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create module.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("list")
    .description("List local habitat modules.")
    .action(async () => {
      try {
        const modules = await readRemoteModules();

        if (modules.length === 0) {
          console.log("No local habitat modules found.");
          return;
        }

        console.log("Local Modules");
        console.log(formatModuleListReport(modules));
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to list modules.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("status")
    .description("Show local habitat module status and power draw.")
    .action(async () => {
      try {
        const modules = await readRemoteModules();

        if (modules.length === 0) {
          console.log("No local habitat modules found.");
          return;
        }

        console.log("Module Status");
        console.log(formatModuleStatusReport(modules));
      } catch (error) {
        const message = getApiErrorMessage(error, "Unable to read module status.");
        console.error(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("set-status")
    .description("Change one local module runtime status.")
    .argument("<module-id>", "module ID or short name")
    .argument("<status>", "new runtime status")
    .action(async (id, status) => {
      if (!allowedModuleStatuses.includes(status)) {
        console.error(`Status must be one of: ${allowedModuleStatuses.join(", ")}.`);
        process.exitCode = 1;
        return;
      }

      try {
        const updatedModule = await updateRemoteModule(id, { status });

        if (!updatedModule) {
          console.error(`No module with ID or short name "${id}" was found.`);
          process.exitCode = 1;
          return;
        }

        console.log(`Set module "${updatedModule.slug}" status to ${status}.`);
        console.log(`Current Power Draw: ${formatNumber(getModulePowerDrawKw(updatedModule))} kW`);
      } catch (error) {
        const message = getApiErrorMessage(error, `No module with ID or short name "${id}" was found.`);
        console.error(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("show")
    .description("Show one local habitat module.")
    .argument("<id>", "module ID")
    .action(async (id) => {
      await showLocalModuleById(id);
    });

  moduleCommand
    .command("info")
    .description("Show detailed local habitat module info.")
    .argument("<id>", "module ID")
    .action(async (id) => {
      await showLocalModuleById(id);
    });

  moduleCommand
    .command("update")
    .description("Update one local habitat module.")
    .argument("<id>", "module ID")
    .option("--blueprint-id <blueprintId>", "new blueprint ID")
    .option("--display-name <displayName>", "new display name")
    .option("--status <status>", "new runtime status")
    .option("--condition <condition>", "new runtime condition", (value) => Number.parseInt(value, 10))
    .action(async (id, options) => {
      try {
        const updatedModule = await updateRemoteModule(id, {
          blueprintId: options.blueprintId,
          displayName: options.displayName,
          status: options.status,
          condition: options.condition,
        });

        if (!updatedModule) {
          console.error(`No module with ID or short name "${id}" was found.`);
          process.exitCode = 1;
          return;
        }

        console.log(`Updated module "${updatedModule.slug}".`);
        printModule(updatedModule);
      } catch (error) {
        const message = getApiErrorMessage(error, `No module with ID or short name "${id}" was found.`);
        console.error(message);
        process.exitCode = 1;
      }
    });

  moduleCommand
    .command("delete")
    .description("Delete one local habitat module.")
    .argument("<id>", "module ID")
    .action(async (id) => {
      try {
        const deleted = await deleteRemoteModule(id);

        if (!deleted) {
          console.error(`No module with ID or short name "${id}" was found.`);
          process.exitCode = 1;
          return;
        }

        console.log(`Deleted module "${id}".`);
      } catch (error) {
        const message = getApiErrorMessage(error, `No module with ID or short name "${id}" was found.`);
        console.error(message);
        process.exitCode = 1;
      }
    });

  program.on("command:*", () => {
    const [unknownCommand = ""] = program.args;

    console.error(
      `Unknown command: ${unknownCommand}\n\nRun "habitat --help" to see available commands.`,
    );

    process.exitCode = 1;
  });

  await program.parseAsync(argv);
}
