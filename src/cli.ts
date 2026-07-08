import { Command } from "commander";
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
import { formatModuleStatusReport } from "./module-status";
import { formatBlueprintList } from "./blueprint-report";
import { formatResourceList } from "./resource-report";
import {
  KeplerBlueprintNotFoundError,
  listBlueprintCatalog,
  showBlueprintCatalogEntry,
  type KeplerBlueprint,
} from "./kepler-blueprints";
import { listResourceCatalog } from "./kepler-resources";
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
  console.log(`Blueprint ID: ${blueprint.blueprintId}`);
  console.log(`Catalog ID: ${blueprint.id}`);
  console.log(`Display Name: ${blueprint.displayName}`);
  console.log(`Status: ${blueprint.status || "unknown"}`);
  console.log(`Build Ticks: ${blueprint.buildTicks}`);
  console.log(`Description: ${blueprint.description || "None"}`);
  console.log(
    `Prerequisites: ${blueprint.prerequisites.length > 0 ? blueprint.prerequisites.join(", ") : "None"}`,
  );
  console.log(
    `Capabilities: ${blueprint.capabilities.length > 0 ? blueprint.capabilities.join(", ") : "None"}`,
  );
  console.log(
    `Inputs: ${Object.keys(blueprint.inputs).length > 0 ? JSON.stringify(blueprint.inputs) : "{}"}`,
  );
  console.log(
    `Output: ${Object.keys(blueprint.output).length > 0 ? JSON.stringify(blueprint.output) : "{}"}`,
  );
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

export async function runHabitat(argv: string[]) {
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
  battery     Show battery status

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
  habitat battery status
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
    .action(async (ticksArg) => {
      const ticks = Number(ticksArg);

      if (!Number.isInteger(ticks) || ticks < 1) {
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
        console.log(`Battery Drain: ${formatNumber(summary.batteryDrainedKwh)} kWh`);
        console.log(`Battery Remaining: ${formatNumber(summary.batteryEnergyAfterKwh)} kWh / ${formatNumber(storageEnergy)} kWh`);
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

  const batteryCommand = program
    .command("battery")
    .description("Inspect the habitat battery.");

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
    .argument("<blueprint-id>", "blueprint ID")
    .action(async (blueprintId) => {
      try {
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

      for (const module of modules) {
        console.log(`${module.slug} | ${module.displayName} | ${String(module.runtimeAttributes.status ?? "unknown")} | condition=${String(module.runtimeAttributes.condition ?? "unknown")}`);
      }
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
      const registration = await readRegistration();
      await ensureLocalModulesFromRegistration(registration);
      const module = await getModule(id);

      if (!module) {
        console.error(`No module with ID or short name "${id}" was found.`);
        process.exitCode = 1;
        return;
      }

      printModule(module);
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
