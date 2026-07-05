import { readData, writeData } from "./store";

export type Airlock = {
  name: string;
  pressureLevel: string;
  locked: boolean;
  doorNames: string[];
};

export async function createAirlock(airlock: Airlock) {
  const data = await readData();

  if (data.airlocks.some((existingAirlock) => existingAirlock.name === airlock.name)) {
    throw new Error(`An airlock named "${airlock.name}" already exists.`);
  }

  data.airlocks.push(airlock);
  await writeData(data);

  return airlock;
}

export async function listAirlocks() {
  const data = await readData();
  return data.airlocks;
}

export async function getAirlock(name: string) {
  const data = await readData();
  return data.airlocks.find((airlock) => airlock.name === name) ?? null;
}

export async function updateAirlock(
  name: string,
  updates: Partial<Pick<Airlock, "pressureLevel" | "locked">>,
) {
  const data = await readData();
  const airlock = data.airlocks.find(
    (existingAirlock) => existingAirlock.name === name,
  );

  if (!airlock) {
    return null;
  }

  if (typeof updates.pressureLevel === "string") {
    airlock.pressureLevel = updates.pressureLevel;
  }

  if (typeof updates.locked === "boolean") {
    airlock.locked = updates.locked;
  }

  await writeData(data);

  return airlock;
}

export async function deleteAirlock(name: string) {
  const data = await readData();
  const nextAirlocks = data.airlocks.filter((airlock) => airlock.name !== name);

  if (nextAirlocks.length === data.airlocks.length) {
    return false;
  }

  data.airlocks = nextAirlocks;
  await writeData(data);
  return true;
}

export async function addDoorToAirlock(airlockName: string, doorName: string) {
  const data = await readData();
  const airlock = data.airlocks.find((existingAirlock) => existingAirlock.name === airlockName);

  if (!airlock) {
    throw new Error(`Airlock "${airlockName}" not found.`);
  }

  const door = data.doors.find((existingDoor) => existingDoor.name === doorName);

  if (!door) {
    throw new Error(`Door "${doorName}" not found.`);
  }

  if (airlock.doorNames.includes(doorName)) {
    throw new Error(`Door "${doorName}" is already attached to airlock "${airlockName}".`);
  }

  airlock.doorNames.push(doorName);
  await writeData(data);

  return airlock;
}
