import { readData, writeData } from "./store";

export type Door = {
  name: string;
  status: string;
  locked: boolean;
};

export async function createDoor(door: Door) {
  const data = await readData();

  if (data.doors.some((existingDoor) => existingDoor.name === door.name)) {
    throw new Error(`A door named "${door.name}" already exists.`);
  }

  data.doors.push(door);
  await writeData(data);

  return door;
}

export async function listDoors() {
  const data = await readData();
  return data.doors;
}

export async function getDoor(name: string) {
  const data = await readData();
  return data.doors.find((door) => door.name === name) ?? null;
}

export async function updateDoor(
  name: string,
  updates: Partial<Pick<Door, "status" | "locked">>,
) {
  const data = await readData();
  const door = data.doors.find((existingDoor) => existingDoor.name === name);

  if (!door) {
    return null;
  }

  if (typeof updates.status === "string") {
    door.status = updates.status;
  }

  if (typeof updates.locked === "boolean") {
    door.locked = updates.locked;
  }

  await writeData(data);

  return door;
}

export async function deleteDoor(name: string) {
  const data = await readData();
  const nextDoors = data.doors.filter((door) => door.name !== name);

  if (nextDoors.length === data.doors.length) {
    return false;
  }

  data.doors = nextDoors;
  data.airlocks = data.airlocks.map((airlock) => ({
    ...airlock,
    doorNames: airlock.doorNames.filter((doorName) => doorName !== name),
  }));
  await writeData(data);

  return true;
}
