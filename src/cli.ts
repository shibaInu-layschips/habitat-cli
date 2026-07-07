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
  ensureLocalModulesFromRegistration,
  readRegistration,
  registerHabitat,
  unregisterHabitat,
  type KeplerRegistration,
} from "./kepler-registration";
import type { HabitatModule } from "./types";

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

async function printRegistrationStatus(registration: KeplerRegistration | null) {
  console.log("Habitat Registration Status");

  if (!registration) {
    console.log("Registration: Not registered");
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
    .description("Register this habitat with Kepler and inspect registration status.")
    .version("0.1.0")
    .showHelpAfterError();

  program.addHelpText(
    "beforeAll",
    `
Habitat CLI for this lab:
  register    Register this habitat with Kepler
  status      Show Kepler registration status
  unregister  Remove this habitat registration from Kepler
  module      Create, inspect, update, and delete local habitat modules

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
  habitat module list
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
        await printRegistrationStatus(registration);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to register habitat.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  program
    .command("status")
    .description("Show Kepler registration status.")
    .action(async () => {
      const registration = await readRegistration();
      await printRegistrationStatus(registration);
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
