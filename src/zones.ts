import { readData, writeData } from "./store";

export type Zone = {
  name: string;
  purpose: string;
  status: string;
};

export async function createZone(zone: Zone) {
  const data = await readData();

  if (data.zones.some((existingZone) => existingZone.name === zone.name)) {
    throw new Error(`A zone named "${zone.name}" already exists.`);
  }

  data.zones.push(zone);
  await writeData(data);

  return zone;
}

export async function listZones() {
  const data = await readData();
  return data.zones;
}

export async function getZone(name: string) {
  const data = await readData();
  return data.zones.find((zone) => zone.name === name) ?? null;
}

export async function updateZone(
  name: string,
  updates: Partial<Pick<Zone, "purpose" | "status">>,
) {
  const data = await readData();
  const zone = data.zones.find((existingZone) => existingZone.name === name);

  if (!zone) {
    return null;
  }

  if (typeof updates.purpose === "string") {
    zone.purpose = updates.purpose;
  }

  if (typeof updates.status === "string") {
    zone.status = updates.status;
  }

  await writeData(data);

  return zone;
}

export async function deleteZone(name: string) {
  const data = await readData();
  const nextZones = data.zones.filter((zone) => zone.name !== name);

  if (nextZones.length === data.zones.length) {
    return false;
  }

  data.zones = nextZones;
  await writeData(data);
  return true;
}
