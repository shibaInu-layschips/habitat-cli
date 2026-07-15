import { readHumanState, writeHumanState } from "./human-storage";
import { getModule } from "./module-storage";
import type { HabitatHuman } from "./types";

function readCrewCapacity(module: { runtimeAttributes: Record<string, unknown> }) {
  const capacity = module.runtimeAttributes.crewCapacity;
  return typeof capacity === "number" && Number.isInteger(capacity) && capacity >= 0 ? capacity : null;
}

export async function moveHuman(humanId: string, destinationModuleId: string): Promise<HabitatHuman> {
  const humanState = await readHumanState();
  const human = humanState.humans.find((candidate) => candidate.id === humanId);

  if (!human) {
    throw new Error(`No human with ID "${humanId}" was found.`);
  }

  const destinationModule = await getModule(destinationModuleId);

  if (!destinationModule) {
    throw new Error(`No module with ID or short name "${destinationModuleId}" was found.`);
  }

  if (human.locationModuleId === destinationModule.id || human.locationModuleId === destinationModule.slug) {
    return human;
  }

  const crewCapacity = readCrewCapacity(destinationModule);
  const occupants = humanState.humans.filter(
    (candidate) => candidate.locationModuleId === destinationModule.id || candidate.locationModuleId === destinationModule.slug,
  ).length;

  if (crewCapacity === null || occupants >= crewCapacity) {
    throw new Error(`Module "${destinationModuleId}" has no open crewCapacity.`);
  }

  const movedHuman = {
    ...human,
    locationModuleId: destinationModule.id,
  };

  await writeHumanState({
    ...humanState,
    humans: humanState.humans.map((candidate) => candidate.id === humanId ? movedHuman : candidate),
  });

  return movedHuman;
}
