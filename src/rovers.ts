import { readData, writeData } from "./store";

export type Rover = {
  name: string;
  damage: string;
  status: string;
  speed: number;
};

export async function createRover(rover: Rover) {
  const data = await readData();

  if (data.rovers.some((existingRover) => existingRover.name === rover.name)) {
    throw new Error(`A rover named "${rover.name}" already exists.`);
  }

  data.rovers.push(rover);
  await writeData(data);

  return rover;
}

export async function listRovers() {
  const data = await readData();
  return data.rovers;
}

export async function getRover(name: string) {
  const data = await readData();
  return data.rovers.find((rover) => rover.name === name) ?? null;
}

export async function updateRover(
  name: string,
  updates: Partial<Pick<Rover, "damage" | "status" | "speed">>,
) {
  const data = await readData();
  const rover = data.rovers.find((existingRover) => existingRover.name === name);

  if (!rover) {
    return null;
  }

  if (typeof updates.damage === "string") {
    rover.damage = updates.damage;
  }

  if (typeof updates.status === "string") {
    rover.status = updates.status;
  }

  if (typeof updates.speed === "number" && Number.isFinite(updates.speed)) {
    rover.speed = updates.speed;
  }

  await writeData(data);

  return rover;
}

export async function deleteRover(name: string) {
  const data = await readData();
  const nextRovers = data.rovers.filter((rover) => rover.name !== name);

  if (nextRovers.length === data.rovers.length) {
    return false;
  }

  data.rovers = nextRovers;
  await writeData(data);
  return true;
}

export async function driveRover(name: string, speed: number) {
  const data = await readData();
  const rover = data.rovers.find((existingRover) => existingRover.name === name);

  if (!rover) {
    return null;
  }

  rover.status = "driving";
  rover.speed = speed;
  await writeData(data);

  return rover;
}

export async function stopRover(name: string) {
  const data = await readData();
  const rover = data.rovers.find((existingRover) => existingRover.name === name);

  if (!rover) {
    return null;
  }

  rover.status = "stopped";
  rover.speed = 0;
  await writeData(data);

  return rover;
}

export async function fixRover(name: string) {
  const data = await readData();
  const rover = data.rovers.find((existingRover) => existingRover.name === name);

  if (!rover) {
    return null;
  }

  rover.damage = "none";
  rover.status = "fixed";
  await writeData(data);

  return rover;
}
