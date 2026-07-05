import { Command } from "commander";
import {
  createAlert,
  deleteAlert,
  getAlert,
  listAlerts,
  sendAlert,
  updateAlert,
  type Alert,
} from "./alerts";
import {
  createBattery,
  getBattery,
  replaceBattery,
  setBatteryDamage,
  setBatteryPercentageEnergy,
  type Battery,
} from "./battery";
import {
  createRover,
  deleteRover,
  driveRover,
  fixRover,
  getRover,
  listRovers,
  stopRover,
  updateRover,
  type Rover,
} from "./rovers";
import {
  addDoorToAirlock,
  createAirlock,
  deleteAirlock,
  getAirlock,
  listAirlocks,
  updateAirlock,
  type Airlock,
} from "./airlocks";
import {
  createDoor,
  deleteDoor,
  getDoor,
  listDoors,
  updateDoor,
  type Door,
} from "./doors";
import {
  createZone,
  deleteZone,
  getZone,
  listZones,
  updateZone,
  type Zone,
} from "./zones";
import {
  createWaterRecycler,
  getWaterRecycler,
  giveWater,
  repairWaterRecycler,
  replaceFilter,
  setFilterStatus,
  setWaterLevel,
  type WaterRecycler,
} from "./water";
import {
  createPowerSystem,
  fixPowerSystem,
  getPowerSystem,
  setPowerSystemDamage,
  setPowerSystemStatus,
  type PowerSystem,
} from "./power-system";

function parseBoolean(value: string) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error('Expected "true" or "false".');
}

function printZone(zone: Zone) {
  console.log(`Name: ${zone.name}`);
  console.log(`Purpose: ${zone.purpose}`);
  console.log(`Status: ${zone.status}`);
}

function printAlert(alert: Alert) {
  console.log(`Name: ${alert.name}`);
  console.log(`Text: ${alert.text}`);
  console.log(`Level: ${alert.level}`);
  console.log(`Status: ${alert.status}`);
}

function printBattery(battery: Battery) {
  console.log("Object: Battery");
  console.log(`Damage: ${battery.damage}`);
  console.log(`Percentage Energy: ${battery.percentageEnergy}`);
}

function printRover(rover: Rover) {
  console.log(`Name: ${rover.name}`);
  console.log(`Damage: ${rover.damage}`);
  console.log(`Status: ${rover.status}`);
  console.log(`Speed: ${rover.speed}`);
}

function printAirlock(airlock: Airlock) {
  console.log(`Name: ${airlock.name}`);
  console.log(`Pressure Level: ${airlock.pressureLevel}`);
  console.log(`Locked: ${airlock.locked}`);
  console.log(
    `Doors: ${airlock.doorNames.length > 0 ? airlock.doorNames.join(", ") : "None"}`,
  );
}

function printDoor(door: Door) {
  console.log(`Name: ${door.name}`);
  console.log(`Status: ${door.status}`);
  console.log(`Locked: ${door.locked}`);
}

function printWaterRecycler(waterRecycler: WaterRecycler) {
  console.log("Object: Water Recycler");
  console.log(`Water Level: ${waterRecycler.waterLevel}`);
  console.log(`Filter Status: ${waterRecycler.filterStatus}`);
}

function printPowerSystem(powerSystem: PowerSystem) {
  console.log("Object: Power System");
  console.log(`Damage: ${powerSystem.damage}`);
  console.log(`Status: ${powerSystem.status}`);
}

export async function runHabitat(argv: string[]) {
  const program = new Command();

  program
    .name("habitat")
    .description("A friendly command-line home for future habitat tools.")
    .version("0.1.0")
    .showHelpAfterError();

  program.addHelpText(
    "beforeAll",
    `
Habitat CLI object model:
  Collections:
    zone, alert, rover, door, airlock
  Singletons:
    battery, power-system, water

Command patterns:
  Collections usually support:
    create, list, show <name>, update <name>, delete <name>
  Singletons usually support:
    create, show, property-specific show/set commands, and action commands

Persistence:
  All objects are stored in one local JSON file:
    .habitat/data.json

Command groups:
  zone       Create, list, show, update, and delete zones
  alert      Create, list, show, update, delete, and send alerts
  battery    Show and operate the battery
  rover      Create, list, show, update, delete, and operate rovers
  door       Create, list, show, update, and delete doors
  airlock    Create, list, show, update, and delete airlocks
  power-system  Show and operate the power system
  water      Show and operate the water recycler
`,
  );

  program.addHelpText(
    "after",
    `
Quick start:
  habitat --help
  habitat zone --help
  habitat alert --help
  habitat battery --help
  habitat rover --help
  habitat door --help
  habitat airlock --help
  habitat power-system --help
  habitat water --help
  zone --help
  alert --help
  battery --help
  rover --help
  door --help
  airlock --help
  power-system --help
  water --help

Useful inspection commands:
  cat .habitat/data.json
  habitat zone list
  habitat alert list
  habitat rover list
  habitat door list
  habitat airlock list
  habitat battery show
  habitat power-system show
  habitat water show
`,
  );

  program.configureOutput({
    outputError: (str, write) => write(str),
  });

  const zoneCommand = program.command("zone").description("Manage zones.");
  const alertCommand = program.command("alert").description("Manage alerts.");
  const batteryCommand = program.command("battery").description("Use the battery.");
  const roverCommand = program.command("rover").description("Manage rovers.");
  const doorCommand = program.command("door").description("Manage doors.");
  const airlockCommand = program.command("airlock").description("Manage airlocks.");
  const powerSystemCommand = program
    .command("power-system")
    .description("Use the power system.");
  const waterCommand = program.command("water").description("Use the water recycler.");

  zoneCommand.addHelpText(
    "after",
    `
Model:
  Zone = { name, purpose, status }

Examples:
  habitat zone create --name kitchen --purpose cooking --status active
  habitat zone list
  habitat zone show kitchen
  habitat zone update kitchen --purpose prep --status paused
  habitat zone delete kitchen
`,
  );

  alertCommand.addHelpText(
    "after",
    `
Model:
  Alert = { name, text, level, status }
  Action:
    send <name>

Examples:
  habitat alert create --name station-warning --text "Low oxygen" --level high --status draft
  habitat alert list
  habitat alert show station-warning
  habitat alert update station-warning --text "Low oxygen in sector 7" --level critical --status ready
  habitat alert send station-warning
  habitat alert delete station-warning
`,
  );

  batteryCommand.addHelpText(
    "after",
    `
Model:
  Battery = { damage, percentageEnergy }
  Singleton:
    only one battery record is stored
  Actions:
    replace

Examples:
  habitat battery create --damage moderate --percentage-energy 65
  habitat battery show
  habitat battery show-damage
  habitat battery show-energy
  habitat battery set-damage severe
  habitat battery set-energy 40
  habitat battery replace
`,
  );

  roverCommand.addHelpText(
    "after",
    `
Model:
  Rover = { name, damage, status, speed }
  Actions:
    drive <name> <speed>, stop <name>, fix <name>

Examples:
  habitat rover create --name scout-1 --damage minor --status idle --speed 0
  habitat rover list
  habitat rover show scout-1
  habitat rover update scout-1 --damage heavy --status parked --speed 2
  habitat rover drive scout-1 12
  habitat rover stop scout-1
  habitat rover fix scout-1
  habitat rover delete scout-1
`,
  );

  doorCommand.addHelpText(
    "after",
    `
Model:
  Door = { name, status, locked }

Examples:
  habitat door create --name inner-hatch --status closed --locked true
  habitat door list
  habitat door show inner-hatch
  habitat door update inner-hatch --status open --locked false
  habitat door delete inner-hatch
`,
  );

  airlockCommand.addHelpText(
    "after",
    `
Model:
  Airlock = { name, pressureLevel, locked, doorNames[] }
  Relationship command:
    add-door <airlockName> <doorName>

Examples:
  habitat airlock create --name main-airlock --pressureLevel medium --locked true
  habitat airlock add-door main-airlock inner-hatch
  habitat airlock show main-airlock
`,
  );

  waterCommand.addHelpText(
    "after",
    `
Model:
  Water Recycler = { waterLevel, filterStatus }
  Singleton:
    only one water recycler record is stored
  Actions:
    give <amount>, replace-filter, repair

Examples:
  habitat water create --water-level 100 --filter-status clean
  habitat water show
  habitat water set-water-level 80
  habitat water set-filter-status dirty
  habitat water give 10
  habitat water replace-filter
  habitat water repair
`,
  );

  powerSystemCommand.addHelpText(
    "after",
    `
Model:
  Power System = { damage, status }
  Singleton:
    only one power system record is stored
  Actions:
    fix

Examples:
  habitat power-system create --damage moderate --status unstable
  habitat power-system show
  habitat power-system show-damage
  habitat power-system show-status
  habitat power-system set-damage severe
  habitat power-system set-status offline
  habitat power-system fix
`,
  );

  zoneCommand
    .command("create")
    .description("Create a zone.")
    .requiredOption("--name <name>", "zone name")
    .requiredOption("--purpose <purpose>", "zone purpose")
    .requiredOption("--status <status>", "zone status")
    .action(async (options) => {
      try {
        const zone = await createZone({
          name: options.name,
          purpose: options.purpose,
          status: options.status,
        });

        console.log(`Created zone "${zone.name}".`);
        printZone(zone);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create zone.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  zoneCommand
    .command("list")
    .description("List zones.")
    .action(async () => {
      const zones = await listZones();

      if (zones.length === 0) {
        console.log("No zones found.");
        return;
      }

      for (const zone of zones) {
        console.log(`${zone.name} | ${zone.purpose} | ${zone.status}`);
      }
    });

  zoneCommand
    .command("show")
    .description("Show one zone.")
    .argument("<name>", "zone name")
    .action(async (name) => {
      const zone = await getZone(name);

      if (!zone) {
        console.error(`Zone "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      printZone(zone);
    });

  zoneCommand
    .command("update")
    .description("Update a zone.")
    .argument("<name>", "zone name")
    .option("--purpose <purpose>", "new zone purpose")
    .option("--status <status>", "new zone status")
    .action(async (name, options) => {
      if (!options.purpose && !options.status) {
        console.error('Provide at least one update option: "--purpose" or "--status".');
        process.exitCode = 1;
        return;
      }

      const zone = await updateZone(name, {
        purpose: options.purpose,
        status: options.status,
      });

      if (!zone) {
        console.error(`Zone "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Updated zone "${zone.name}".`);
      printZone(zone);
    });

  zoneCommand
    .command("delete")
    .description("Delete a zone.")
    .argument("<name>", "zone name")
    .action(async (name) => {
      const deleted = await deleteZone(name);

      if (!deleted) {
        console.error(`Zone "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Deleted zone "${name}".`);
    });

  alertCommand
    .command("create")
    .description("Create an alert.")
    .requiredOption("--name <name>", "alert name")
    .requiredOption("--text <text>", "alert text")
    .requiredOption("--level <level>", "alert level")
    .requiredOption("--status <status>", "alert status")
    .action(async (options) => {
      try {
        const alert = await createAlert({
          name: options.name,
          text: options.text,
          level: options.level,
          status: options.status,
        });

        console.log(`Created alert "${alert.name}".`);
        printAlert(alert);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create alert.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  alertCommand
    .command("list")
    .description("List alerts.")
    .action(async () => {
      const alerts = await listAlerts();

      if (alerts.length === 0) {
        console.log("No alerts found.");
        return;
      }

      for (const alert of alerts) {
        console.log(`${alert.name} | ${alert.level} | ${alert.status}`);
      }
    });

  alertCommand
    .command("show")
    .description("Show one alert.")
    .argument("<name>", "alert name")
    .action(async (name) => {
      const alert = await getAlert(name);

      if (!alert) {
        console.error(`Alert "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      printAlert(alert);
    });

  alertCommand
    .command("update")
    .description("Update an alert.")
    .argument("<name>", "alert name")
    .option("--text <text>", "new alert text")
    .option("--level <level>", "new alert level")
    .option("--status <status>", "new alert status")
    .action(async (name, options) => {
      if (!options.text && !options.level && !options.status) {
        console.error('Provide at least one update option: "--text", "--level", or "--status".');
        process.exitCode = 1;
        return;
      }

      const alert = await updateAlert(name, {
        text: options.text,
        level: options.level,
        status: options.status,
      });

      if (!alert) {
        console.error(`Alert "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Updated alert "${alert.name}".`);
      printAlert(alert);
    });

  alertCommand
    .command("delete")
    .description("Delete an alert.")
    .argument("<name>", "alert name")
    .action(async (name) => {
      const deleted = await deleteAlert(name);

      if (!deleted) {
        console.error(`Alert "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Deleted alert "${name}".`);
    });

  alertCommand
    .command("send")
    .description("Send an alert.")
    .argument("<name>", "alert name")
    .action(async (name) => {
      const alert = await sendAlert(name);

      if (!alert) {
        console.error(`Alert "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Sent alert "${alert.name}".`);
      printAlert(alert);
    });

  batteryCommand
    .command("create")
    .description("Create the battery.")
    .requiredOption("--damage <damage>", "starting damage")
    .requiredOption("--percentage-energy <percentageEnergy>", "starting percentage energy")
    .action(async (options) => {
      try {
        const battery = await createBattery({
          damage: options.damage,
          percentageEnergy: Number(options.percentageEnergy),
        });

        console.log("Created battery.");
        printBattery(battery);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create battery.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  batteryCommand
    .command("show")
    .description("Show the battery.")
    .action(async () => {
      const battery = await getBattery();

      if (!battery) {
        console.error("Battery not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      printBattery(battery);
    });

  batteryCommand
    .command("show-damage")
    .description("Show battery damage.")
    .action(async () => {
      const battery = await getBattery();

      if (!battery) {
        console.error("Battery not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      console.log(`Damage: ${battery.damage}`);
    });

  batteryCommand
    .command("show-energy")
    .description("Show battery percentage energy.")
    .action(async () => {
      const battery = await getBattery();

      if (!battery) {
        console.error("Battery not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      console.log(`Percentage Energy: ${battery.percentageEnergy}`);
    });

  batteryCommand
    .command("set-damage")
    .description("Update battery damage.")
    .argument("<damage>", "new damage value")
    .action(async (damage) => {
      try {
        const battery = await setBatteryDamage(damage);
        console.log("Updated battery damage.");
        printBattery(battery);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update battery damage.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  batteryCommand
    .command("set-energy")
    .description("Update battery percentage energy.")
    .argument("<percentageEnergy>", "new percentage energy")
    .action(async (percentageEnergy) => {
      try {
        const battery = await setBatteryPercentageEnergy(Number(percentageEnergy));
        console.log("Updated battery percentage energy.");
        printBattery(battery);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update battery percentage energy.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  batteryCommand
    .command("replace")
    .description("Replace the battery.")
    .action(async () => {
      try {
        const battery = await replaceBattery();
        console.log("Replaced the battery.");
        printBattery(battery);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to replace battery.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  roverCommand
    .command("create")
    .description("Create a rover.")
    .requiredOption("--name <name>", "rover name")
    .requiredOption("--damage <damage>", "rover damage")
    .requiredOption("--status <status>", "rover status")
    .requiredOption("--speed <speed>", "rover speed")
    .action(async (options) => {
      try {
        const rover = await createRover({
          name: options.name,
          damage: options.damage,
          status: options.status,
          speed: Number(options.speed),
        });

        console.log(`Created rover "${rover.name}".`);
        printRover(rover);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create rover.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  roverCommand
    .command("list")
    .description("List rovers.")
    .action(async () => {
      const rovers = await listRovers();

      if (rovers.length === 0) {
        console.log("No rovers found.");
        return;
      }

      for (const rover of rovers) {
        console.log(`${rover.name} | ${rover.damage} | ${rover.status} | ${rover.speed}`);
      }
    });

  roverCommand
    .command("show")
    .description("Show one rover.")
    .argument("<name>", "rover name")
    .action(async (name) => {
      const rover = await getRover(name);

      if (!rover) {
        console.error(`Rover "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      printRover(rover);
    });

  roverCommand
    .command("update")
    .description("Update a rover.")
    .argument("<name>", "rover name")
    .option("--damage <damage>", "new rover damage")
    .option("--status <status>", "new rover status")
    .option("--speed <speed>", "new rover speed")
    .action(async (name, options) => {
      if (!options.damage && !options.status && !options.speed) {
        console.error(
          'Provide at least one update option: "--damage", "--status", or "--speed".',
        );
        process.exitCode = 1;
        return;
      }

      const rover = await updateRover(name, {
        damage: options.damage,
        status: options.status,
        speed: typeof options.speed === "string" ? Number(options.speed) : undefined,
      });

      if (!rover) {
        console.error(`Rover "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Updated rover "${rover.name}".`);
      printRover(rover);
    });

  roverCommand
    .command("delete")
    .description("Delete a rover.")
    .argument("<name>", "rover name")
    .action(async (name) => {
      const deleted = await deleteRover(name);

      if (!deleted) {
        console.error(`Rover "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Deleted rover "${name}".`);
    });

  roverCommand
    .command("drive")
    .description("Drive a rover at a speed.")
    .argument("<name>", "rover name")
    .argument("<speed>", "drive speed")
    .action(async (name, speed) => {
      const rover = await driveRover(name, Number(speed));

      if (!rover) {
        console.error(`Rover "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Driving rover "${rover.name}".`);
      printRover(rover);
    });

  roverCommand
    .command("stop")
    .description("Stop a rover.")
    .argument("<name>", "rover name")
    .action(async (name) => {
      const rover = await stopRover(name);

      if (!rover) {
        console.error(`Rover "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Stopped rover "${rover.name}".`);
      printRover(rover);
    });

  roverCommand
    .command("fix")
    .description("Fix a rover.")
    .argument("<name>", "rover name")
    .action(async (name) => {
      const rover = await fixRover(name);

      if (!rover) {
        console.error(`Rover "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Fixed rover "${rover.name}".`);
      printRover(rover);
    });

  powerSystemCommand
    .command("create")
    .description("Create the power system.")
    .requiredOption("--damage <damage>", "starting damage")
    .requiredOption("--status <status>", "starting status")
    .action(async (options) => {
      try {
        const powerSystem = await createPowerSystem({
          damage: options.damage,
          status: options.status,
        });

        console.log("Created power system.");
        printPowerSystem(powerSystem);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create power system.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  powerSystemCommand
    .command("show")
    .description("Show the power system.")
    .action(async () => {
      const powerSystem = await getPowerSystem();

      if (!powerSystem) {
        console.error("Power system not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      printPowerSystem(powerSystem);
    });

  powerSystemCommand
    .command("show-damage")
    .description("Show power system damage.")
    .action(async () => {
      const powerSystem = await getPowerSystem();

      if (!powerSystem) {
        console.error("Power system not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      console.log(`Damage: ${powerSystem.damage}`);
    });

  powerSystemCommand
    .command("show-status")
    .description("Show power system status.")
    .action(async () => {
      const powerSystem = await getPowerSystem();

      if (!powerSystem) {
        console.error("Power system not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      console.log(`Status: ${powerSystem.status}`);
    });

  powerSystemCommand
    .command("set-damage")
    .description("Update power system damage.")
    .argument("<damage>", "new damage value")
    .action(async (damage) => {
      try {
        const powerSystem = await setPowerSystemDamage(damage);
        console.log("Updated power system damage.");
        printPowerSystem(powerSystem);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update power system damage.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  powerSystemCommand
    .command("set-status")
    .description("Update power system status.")
    .argument("<status>", "new status value")
    .action(async (status) => {
      try {
        const powerSystem = await setPowerSystemStatus(status);
        console.log("Updated power system status.");
        printPowerSystem(powerSystem);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update power system status.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  powerSystemCommand
    .command("fix")
    .description("Fix the power system.")
    .action(async () => {
      try {
        const powerSystem = await fixPowerSystem();
        console.log("Fixed the power system.");
        printPowerSystem(powerSystem);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to fix power system.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  doorCommand
    .command("create")
    .description("Create a door.")
    .requiredOption("--name <name>", "door name")
    .requiredOption("--status <status>", "door status")
    .requiredOption("--locked <locked>", 'door locked state: "true" or "false"')
    .action(async (options) => {
      try {
        const door = await createDoor({
          name: options.name,
          status: options.status,
          locked: parseBoolean(options.locked),
        });

        console.log(`Created door "${door.name}".`);
        printDoor(door);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create door.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  doorCommand
    .command("list")
    .description("List doors.")
    .action(async () => {
      const doors = await listDoors();

      if (doors.length === 0) {
        console.log("No doors found.");
        return;
      }

      for (const door of doors) {
        console.log(`${door.name} | ${door.status} | ${door.locked}`);
      }
    });

  doorCommand
    .command("show")
    .description("Show one door.")
    .argument("<name>", "door name")
    .action(async (name) => {
      const door = await getDoor(name);

      if (!door) {
        console.error(`Door "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      printDoor(door);
    });

  doorCommand
    .command("update")
    .description("Update a door.")
    .argument("<name>", "door name")
    .option("--status <status>", "new door status")
    .option("--locked <locked>", 'new door locked state: "true" or "false"')
    .action(async (name, options) => {
      if (!options.status && !options.locked) {
        console.error('Provide at least one update option: "--status" or "--locked".');
        process.exitCode = 1;
        return;
      }

      try {
        const door = await updateDoor(name, {
          status: options.status,
          locked:
            typeof options.locked === "string" ? parseBoolean(options.locked) : undefined,
        });

        if (!door) {
          console.error(`Door "${name}" not found.`);
          process.exitCode = 1;
          return;
        }

        console.log(`Updated door "${door.name}".`);
        printDoor(door);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update door.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  doorCommand
    .command("delete")
    .description("Delete a door.")
    .argument("<name>", "door name")
    .action(async (name) => {
      const deleted = await deleteDoor(name);

      if (!deleted) {
        console.error(`Door "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Deleted door "${name}".`);
    });

  airlockCommand
    .command("create")
    .description("Create an airlock.")
    .requiredOption("--name <name>", "airlock name")
    .requiredOption("--pressureLevel <pressureLevel>", "airlock pressure level")
    .requiredOption("--locked <locked>", 'airlock locked state: "true" or "false"')
    .action(async (options) => {
      try {
        const airlock = await createAirlock({
          name: options.name,
          pressureLevel: options.pressureLevel,
          locked: parseBoolean(options.locked),
          doorNames: [],
        });

        console.log(`Created airlock "${airlock.name}".`);
        printAirlock(airlock);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create airlock.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  airlockCommand
    .command("list")
    .description("List airlocks.")
    .action(async () => {
      const airlocks = await listAirlocks();

      if (airlocks.length === 0) {
        console.log("No airlocks found.");
        return;
      }

      for (const airlock of airlocks) {
        console.log(
          `${airlock.name} | ${airlock.pressureLevel} | ${airlock.locked} | doors: ${airlock.doorNames.length}`,
        );
      }
    });

  airlockCommand
    .command("show")
    .description("Show one airlock.")
    .argument("<name>", "airlock name")
    .action(async (name) => {
      const airlock = await getAirlock(name);

      if (!airlock) {
        console.error(`Airlock "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      printAirlock(airlock);
    });

  airlockCommand
    .command("update")
    .description("Update an airlock.")
    .argument("<name>", "airlock name")
    .option("--pressureLevel <pressureLevel>", "new airlock pressure level")
    .option("--locked <locked>", 'new airlock locked state: "true" or "false"')
    .action(async (name, options) => {
      if (!options.pressureLevel && !options.locked) {
        console.error('Provide at least one update option: "--pressureLevel" or "--locked".');
        process.exitCode = 1;
        return;
      }

      try {
        const airlock = await updateAirlock(name, {
          pressureLevel: options.pressureLevel,
          locked:
            typeof options.locked === "string" ? parseBoolean(options.locked) : undefined,
        });

        if (!airlock) {
          console.error(`Airlock "${name}" not found.`);
          process.exitCode = 1;
          return;
        }

      console.log(`Updated airlock "${airlock.name}".`);
      printAirlock(airlock);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update airlock.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  airlockCommand
    .command("delete")
    .description("Delete an airlock.")
    .argument("<name>", "airlock name")
    .action(async (name) => {
      const deleted = await deleteAirlock(name);

      if (!deleted) {
        console.error(`Airlock "${name}" not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Deleted airlock "${name}".`);
    });

  airlockCommand
    .command("add-door")
    .description("Attach a door to an airlock.")
    .argument("<airlockName>", "airlock name")
    .argument("<doorName>", "door name")
    .action(async (airlockName, doorName) => {
      try {
        const airlock = await addDoorToAirlock(airlockName, doorName);
        console.log(`Attached door "${doorName}" to airlock "${airlockName}".`);
        printAirlock(airlock);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to attach door to airlock.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  waterCommand
    .command("create")
    .description("Create the water recycler.")
    .requiredOption("--water-level <waterLevel>", "starting water level")
    .requiredOption("--filter-status <filterStatus>", "starting filter status")
    .action(async (options) => {
      try {
        const waterRecycler = await createWaterRecycler({
          waterLevel: Number(options.waterLevel),
          filterStatus: options.filterStatus,
        });

        console.log("Created water recycler.");
        printWaterRecycler(waterRecycler);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to create water recycler.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  waterCommand
    .command("show")
    .description("Show the water recycler.")
    .action(async () => {
      const waterRecycler = await getWaterRecycler();

      if (!waterRecycler) {
        console.error("Water recycler not found. Create it first.");
        process.exitCode = 1;
        return;
      }

      printWaterRecycler(waterRecycler);
    });

  waterCommand
    .command("set-water-level")
    .description("Update the water level.")
    .argument("<waterLevel>", "new water level")
    .action(async (waterLevel) => {
      try {
        const waterRecycler = await setWaterLevel(Number(waterLevel));
        console.log("Updated water level.");
        printWaterRecycler(waterRecycler);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update water level.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  waterCommand
    .command("set-filter-status")
    .description("Update the filter status.")
    .argument("<filterStatus>", "new filter status")
    .action(async (filterStatus) => {
      try {
        const waterRecycler = await setFilterStatus(filterStatus);
        console.log("Updated filter status.");
        printWaterRecycler(waterRecycler);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to update filter status.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  waterCommand
    .command("give")
    .description("Give people water.")
    .argument("<amount>", "amount of water to give")
    .action(async (amount) => {
      try {
        const waterRecycler = await giveWater(Number(amount));
        console.log(`Gave out ${amount} units of water.`);
        printWaterRecycler(waterRecycler);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to give water.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  waterCommand
    .command("replace-filter")
    .description("Replace the filter.")
    .action(async () => {
      try {
        const waterRecycler = await replaceFilter();
        console.log("Replaced the filter.");
        printWaterRecycler(waterRecycler);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to replace filter.";
        console.error(message);
        process.exitCode = 1;
      }
    });

  waterCommand
    .command("repair")
    .description("Repair the water recycler.")
    .action(async () => {
      try {
        const waterRecycler = await repairWaterRecycler();
        console.log("Repaired the water recycler.");
        printWaterRecycler(waterRecycler);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to repair water recycler.";
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
