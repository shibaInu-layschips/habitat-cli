import { readData, writeData } from "./store";

export type Battery = {
  damage: string;
  percentageEnergy: number;
};

export async function createBattery(battery: Battery) {
  const data = await readData();

  if (data.battery) {
    throw new Error("Battery already exists.");
  }

  data.battery = battery;
  await writeData(data);

  return battery;
}

export async function getBattery() {
  const data = await readData();
  return data.battery;
}

export async function setBatteryDamage(damage: string) {
  const data = await readData();

  if (!data.battery) {
    throw new Error("Battery not found. Create it first.");
  }

  data.battery.damage = damage;
  await writeData(data);

  return data.battery;
}

export async function setBatteryPercentageEnergy(percentageEnergy: number) {
  const data = await readData();

  if (!data.battery) {
    throw new Error("Battery not found. Create it first.");
  }

  data.battery.percentageEnergy = percentageEnergy;
  await writeData(data);

  return data.battery;
}

export async function replaceBattery() {
  const data = await readData();

  if (!data.battery) {
    throw new Error("Battery not found. Create it first.");
  }

  data.battery.damage = "none";
  data.battery.percentageEnergy = 100;
  await writeData(data);

  return data.battery;
}
