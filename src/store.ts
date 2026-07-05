import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type HabitatData = {
  zones: Array<{
    name: string;
    purpose: string;
    status: string;
  }>;
  alerts: Array<{
    name: string;
    text: string;
    level: string;
    status: string;
  }>;
  rovers: Array<{
    name: string;
    damage: string;
    status: string;
    speed: number;
  }>;
  doors: Array<{
    name: string;
    status: string;
    locked: boolean;
  }>;
  airlocks: Array<{
    name: string;
    pressureLevel: string;
    locked: boolean;
    doorNames: string[];
  }>;
  battery: {
    damage: string;
    percentageEnergy: number;
  } | null;
  powerSystem: {
    damage: string;
    status: string;
  } | null;
  waterRecycler: {
    waterLevel: number;
    filterStatus: string;
  } | null;
};

const dataFilePath = join(process.cwd(), ".habitat", "data.json");

function emptyData(): HabitatData {
  return {
    zones: [],
    alerts: [],
    rovers: [],
    doors: [],
    airlocks: [],
    battery: null,
    powerSystem: null,
    waterRecycler: null,
  };
}

async function ensureDataDir() {
  await mkdir(dirname(dataFilePath), { recursive: true });
}

export async function readData(): Promise<HabitatData> {
  if (!existsSync(dataFilePath)) {
    return emptyData();
  }

  const raw = await readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<HabitatData>;

  return {
    zones: Array.isArray(parsed.zones) ? parsed.zones : [],
    alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
    rovers: Array.isArray(parsed.rovers) ? parsed.rovers : [],
    doors: Array.isArray(parsed.doors) ? parsed.doors : [],
    airlocks: Array.isArray(parsed.airlocks) ? parsed.airlocks : [],
    battery:
      parsed.battery &&
      typeof parsed.battery === "object" &&
      typeof parsed.battery.damage === "string" &&
      typeof parsed.battery.percentageEnergy === "number"
        ? parsed.battery
        : null,
    powerSystem:
      parsed.powerSystem &&
      typeof parsed.powerSystem === "object" &&
      typeof parsed.powerSystem.damage === "string" &&
      typeof parsed.powerSystem.status === "string"
        ? parsed.powerSystem
        : null,
    waterRecycler:
      parsed.waterRecycler &&
      typeof parsed.waterRecycler === "object" &&
      typeof parsed.waterRecycler.waterLevel === "number" &&
      typeof parsed.waterRecycler.filterStatus === "string"
        ? parsed.waterRecycler
        : null,
  };
}

export async function writeData(data: HabitatData) {
  const hasAnyRecords =
    data.zones.length > 0 ||
    data.alerts.length > 0 ||
    data.rovers.length > 0 ||
    data.doors.length > 0 ||
    data.airlocks.length > 0 ||
    data.battery !== null ||
    data.powerSystem !== null ||
    data.waterRecycler !== null;

  if (!hasAnyRecords) {
    if (existsSync(dataFilePath)) {
      await rm(dataFilePath, { force: true });
    }

    return;
  }

  await ensureDataDir();
  await writeFile(dataFilePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function getDataFilePath() {
  return dataFilePath;
}
