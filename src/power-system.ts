import { readData, writeData } from "./store";

export type PowerSystem = {
  damage: string;
  status: string;
};

export async function createPowerSystem(powerSystem: PowerSystem) {
  const data = await readData();

  if (data.powerSystem) {
    throw new Error("Power system already exists.");
  }

  data.powerSystem = powerSystem;
  await writeData(data);

  return powerSystem;
}

export async function getPowerSystem() {
  const data = await readData();
  return data.powerSystem;
}

export async function setPowerSystemDamage(damage: string) {
  const data = await readData();

  if (!data.powerSystem) {
    throw new Error("Power system not found. Create it first.");
  }

  data.powerSystem.damage = damage;
  await writeData(data);

  return data.powerSystem;
}

export async function setPowerSystemStatus(status: string) {
  const data = await readData();

  if (!data.powerSystem) {
    throw new Error("Power system not found. Create it first.");
  }

  data.powerSystem.status = status;
  await writeData(data);

  return data.powerSystem;
}

export async function fixPowerSystem() {
  const data = await readData();

  if (!data.powerSystem) {
    throw new Error("Power system not found. Create it first.");
  }

  data.powerSystem.damage = "none";
  data.powerSystem.status = "operational";
  await writeData(data);

  return data.powerSystem;
}
