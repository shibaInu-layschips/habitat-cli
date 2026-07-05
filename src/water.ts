import { readData, writeData } from "./store";

export type WaterRecycler = {
  waterLevel: number;
  filterStatus: string;
};

function getExistingWaterRecycler(data: Awaited<ReturnType<typeof readData>>) {
  return data.waterRecycler;
}

export async function createWaterRecycler(waterRecycler: WaterRecycler) {
  const data = await readData();

  if (getExistingWaterRecycler(data)) {
    throw new Error("Water recycler already exists.");
  }

  data.waterRecycler = waterRecycler;
  await writeData(data);

  return waterRecycler;
}

export async function getWaterRecycler() {
  const data = await readData();
  return getExistingWaterRecycler(data);
}

export async function setWaterLevel(waterLevel: number) {
  const data = await readData();

  if (!data.waterRecycler) {
    throw new Error("Water recycler not found. Create it first.");
  }

  data.waterRecycler.waterLevel = waterLevel;
  await writeData(data);

  return data.waterRecycler;
}

export async function setFilterStatus(filterStatus: string) {
  const data = await readData();

  if (!data.waterRecycler) {
    throw new Error("Water recycler not found. Create it first.");
  }

  data.waterRecycler.filterStatus = filterStatus;
  await writeData(data);

  return data.waterRecycler;
}

export async function giveWater(amount: number) {
  const data = await readData();

  if (!data.waterRecycler) {
    throw new Error("Water recycler not found. Create it first.");
  }

  if (amount <= 0) {
    throw new Error("Water amount must be greater than 0.");
  }

  if (data.waterRecycler.waterLevel < amount) {
    throw new Error("Not enough water available.");
  }

  data.waterRecycler.waterLevel -= amount;
  await writeData(data);

  return data.waterRecycler;
}

export async function replaceFilter() {
  const data = await readData();

  if (!data.waterRecycler) {
    throw new Error("Water recycler not found. Create it first.");
  }

  data.waterRecycler.filterStatus = "replaced";
  await writeData(data);

  return data.waterRecycler;
}

export async function repairWaterRecycler() {
  const data = await readData();

  if (!data.waterRecycler) {
    throw new Error("Water recycler not found. Create it first.");
  }

  data.waterRecycler.filterStatus = "operational";
  await writeData(data);

  return data.waterRecycler;
}
