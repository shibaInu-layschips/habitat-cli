import { Command } from "commander";
import {
  readRegistration,
  registerHabitat,
  unregisterHabitat,
  type KeplerRegistration,
} from "./kepler-registration";

function printRegistrationStatus(registration: KeplerRegistration | null) {
  console.log("Habitat Registration Status");

  if (!registration) {
    console.log("Registration: Not registered");
    return;
  }

  console.log(`Registration: ${registration.status}`);
  console.log(`Registered Name: ${registration.habitatName}`);
  console.log(`Registered At: ${registration.registeredAt}`);
  console.log(`Registration ID: ${registration.registrationId ?? "Unknown"}`);
  console.log(`Habitat ID: ${registration.habitatId ?? "Unknown"}`);
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

Persistence:
  Registration is stored locally in:
    .habitat/registration.json
`,
  );

  program.addHelpText(
    "after",
    `
Quick start:
  habitat --help
  habitat register --name "Apollo 2.0"
  habitat status
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
        printRegistrationStatus(registration);
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
      printRegistrationStatus(registration);
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

  program.on("command:*", () => {
    const [unknownCommand = ""] = program.args;

    console.error(
      `Unknown command: ${unknownCommand}\n\nRun "habitat --help" to see available commands.`,
    );

    process.exitCode = 1;
  });

  await program.parseAsync(argv);
}
