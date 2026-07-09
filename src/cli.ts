import { Command } from "commander";
import { evaluateConstructionDryRun } from "./construction-readiness";
import {
  cancelActiveJobByFacility,
  createConstructionJob,
  findActiveJobByFacility,
  readConstructionState,
} from "./construction-storage";
import { addInventoryItem, listInventoryItems, spendInventoryResources } from "./inventory-storage";
import {
  countModules,
  createModule,
  deleteModule,
  getModule,
  listModules,
  updateModule,
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
import {
  KeplerBlueprintNotFoundError,
  listBlueprintCatalog,
  showBlueprintCatalogEntry,
  type KeplerBlueprint,
} from "./kepler-blueprints";
import { listResourceCatalog } from "./kepler-resources";
import { readSolarIrradianceReading } from "./kepler-irradiance";
import {
  ensureLocalModulesFromRegistration,
  readRegistration,
  registerHabitat,
  unregisterHabitat,
  type KeplerRegistration,
} from "./kepler-registration";
import type { HabitatModule } from "./types";

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

async function printHabitatStatus(registration: KeplerRegistration | null) {
  const simulationState = await readSimulationState();
  const existingModuleCount = await countModules();
  console.log("Habitat Status");
  console.log(`Current Tick: ${simulationState.currentTick}`);

  if (!registration) {
    console.log("Registration: Not registered");
    console.log(`Modules: ${existingModuleCount}`);
    return;
  }

  await ensureLocalModulesFromRegistration(registration);
  const moduleCount = await countModules();

  console.log(`Registration: ${registration.status}`);
  console.log(`Registered Name: ${registration.habitatName}`);
  console.log(`Registered At: ${registration.registeredAt}`);
  console.log(`Registration ID: ${registration.registrationId ?? "Unknown"}`);
  console.log(`Habitat ID: ${registration.habitatId ?? "Unknown"}`);
  console.log(`Modules: ${moduleCount}`);
}

async function showLocalModuleById(id: string) {
  const registration = await readRegistration();
  await ensureLocalModulesFromRegistration(registration);
  const module = await getModule(id);

  if (!module) {
    console.error(`No module with ID or short name "${id}" was found.`);
    process.exitCode = 1;
    return;
  }

  const activeJob = await findActiveJobByFacility(module.slug);
  console.log(formatModuleInfo(module, activeJob));
}

async function showLocalModuleStatusById(id: string) {
  const registration = await readRegistration();
  await ensureLocalModulesFromRegistration(registration);
  const module = await getModule(id);

  if (!module) {
    console.error(`No module with ID or short name "${id}" was found.`);
    process.exitCode = 1;
    return;
  }

  const activeJob = await findActiveJobByFacility(module.slug);
  console.log(formatModuleStatusDetails(module, activeJob));
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
    .description("Register this habitat with Kepler and inspect habitat status.")
    .version("0.1.0")
    .showHelpAfterError();

  program.addHelpText(
    "beforeAll",
    `
Habitat CLI for this lab:
  register    Register this habitat with Kepler
  status      Show habitat status
  unregister  Remove this habitat registration from Kepler
  tick        Advance the habitat simulation and drain battery power
  blueprint   Read the Kepler blueprint catalog
  resource    Read the Kepler resource catalog
  module      Create, inspect, update, and delete local habitat modules
  inventory   Inspect local habitat inventory
  construction Inspect local construction jobs
  battery     Show battery status
  power       Inspect habitat power usage and generation
  solar       Inspect solar irradiance status

Persistence:
  Registration is stored locally in:
    .habitat/registration.json
  Editable local modules are stored in:
    .habitat/modules.json
`,
  );

  program.addHelpText(
    "after",
    `
Quick start:
  habitat --help
  habitat register --name "Apollo 2.0"
  habitat status
  habitat blueprint list
  habitat blueprint show basic-battery
  habitat resource list
  habitat tick 10
  habitat module list
  habitat module info workshop-fabricator-1
  habitat module workshop-fabricator-1 status
  habitat inventory list
  habitat construction status
  habitat battery status
  habitat power overview
  habitat solar status
  habitat unregister

Required environment variables:
  KEPLER_BASE_URL
  KEPLER_PLANET_TOKEN
`,
  );

  program.configureOutput({
    outputError: (str, write) => write(str),
  });

  program
    .command("register")
    .description("Register this habitat with Kepler.")
    .requiredOption("--name <name>", "habitat name to register")
    .action(async (options) => {
      try {
        const registration = await registerHabitat(options.name);
        console.log(`Registered habitat "${registration.habitatName}" with Kepler.`);
        await printHabitatStatus(registration);
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
      const registration = await readRegistration();
      await printHabitatStatus(registration);
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
    .description("Remove this habitat registration from Kepler.")
    .action(async () => {
      try {
        const removed = await unregisterHabitat();

        if (!removed) {
          console.log("This habitat is not currently registered.");
          return;
        }

        console.log("Removed habitat registration from Kepler.");
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

  const blueprintCommand = program
    .command("blueprint")
    .description("Read the official Kepler blueprint catalog.");

  const resourceCommand = program
    .command("resource")
    .description("Read the official Kepler resource catalog.");

  const inventoryCommand = program
    .command("inventory")
    .description("Inspect local habitat inventory.");

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
    .description("Inspect solar irradiance status.");

  blueprintCommand
    .command("list")
    .description("List official Kepler blueprint catalog entries.")
    .action(async () => {
      try {
        const blueprints = await listBlueprintCatalog();

        if (blueprints.length === 0) {
          console.log("No Kepler blueprint catalog entries were returned.");
          return;
        }

        console.log("Kepler Blueprint Catalog");
        console.log(formatBlueprintList(blueprints));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to list Kepler blueprints.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  blueprintCommand
    .command("show")
    .description("Show one official Kepler blueprint catalog entry.")
    .argument("<blueprint-id...>", "blueprint ID or display name")
    .action(async (blueprintIdParts: string[]) => {
      try {
        const blueprintId = blueprintIdParts.join(" ");
        const blueprint = await showBlueprintCatalogEntry(blueprintId);
        printBlueprint(blueprint);
      } catch (error) {
        const message =
          error instanceof KeplerBlueprintNotFoundError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to show Kepler blueprint.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  resourceCommand
    .command("list")
    .description("List official Kepler resource catalog entries.")
    .action(async () => {
      try {
        const resources = await listResourceCatalog();

        if (resources.length === 0) {
          console.log("No Kepler resource catalog entries were returned.");
          return;
        }

        console.log("Kepler Resource Catalog");
        console.log(formatResourceList(resources));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to list Kepler resources.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  inventoryCommand
    .command("list")
    .description("List local habitat inventory.")
    .action(async () => {
      const items = await listInventoryItems();

      if (items.length === 0) {
        console.log("No local inventory recorded.");
        return;
      }

      console.log("Local Inventory");

      for (const item of items) {
        console.log(`${item.resourceType} | ${item.displayName} | ${formatNumber(item.quantity)} ${item.unit}`);
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

      await addInventoryItem(resourceType, quantity);
      console.log(`Added ${formatNumber(quantity)} of "${resourceType}" to local inventory.`);
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
        await spendInventoryResources(result.blueprint.inputs as Record<string, number>);
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
    .description("Show solar irradiance status from Kepler.")
    .action(async () => {
      try {
        const reading = await readSolarIrradianceReading();

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
        const module = await createModule({
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
        console.log(`Created module "${module.slug}".`);
        printModule(module);
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
      const registration = await readRegistration();
      await ensureLocalModulesFromRegistration(registration);
      const modules = await listModules();

      if (modules.length === 0) {
        console.log("No local habitat modules found.");
        return;
      }

      console.log("Local Modules");
      console.log(formatModuleListReport(modules));
    });

  moduleCommand
    .command("status")
    .description("Show local habitat module status and power draw.")
    .action(async () => {
      const registration = await readRegistration();
      await ensureLocalModulesFromRegistration(registration);
      const modules = await listModules();

      if (modules.length === 0) {
        console.log("No local habitat modules found.");
        return;
      }

      console.log("Module Status");
      console.log(formatModuleStatusReport(modules));
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

      const updatedModule = await updateModule(id, { status });

      if (!updatedModule) {
        console.error(`No module with ID or short name "${id}" was found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Set module "${updatedModule.slug}" status to ${status}.`);
      console.log(`Current Power Draw: ${formatNumber(getModulePowerDrawKw(updatedModule))} kW`);
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
      const updatedModule = await updateModule(id, {
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
    });

  moduleCommand
    .command("delete")
    .description("Delete one local habitat module.")
    .argument("<id>", "module ID")
    .action(async (id) => {
      const deleted = await deleteModule(id);

      if (!deleted) {
        console.error(`No module with ID or short name "${id}" was found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Deleted module "${id}".`);
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
