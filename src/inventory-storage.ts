import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InventoryItem, InventoryState } from "./types";

function defaultInventoryState(): InventoryState {
  return {
    items: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseInventoryItem(value: unknown): InventoryItem | null {
  if (!isObject(value)) {
    return null;
  }

  const resourceType = asString(value.resourceType);
  const displayName = asString(value.displayName);
  const quantity = asNumber(value.quantity);
  const unit = asString(value.unit);

  if (!resourceType || !displayName || quantity === null || !unit) {
    return null;
  }

  return {
    resourceType,
    displayName,
    quantity,
    unit,
  };
}

async function ensureInventoryDir() {
  await mkdir(dirname(getInventoryFilePath()), { recursive: true });
}

export function getInventoryFilePath() {
  return join(process.cwd(), ".habitat", "inventory.json");
}

export async function readInventoryState(): Promise<InventoryState> {
  const inventoryFilePath = getInventoryFilePath();

  if (!existsSync(inventoryFilePath)) {
    return defaultInventoryState();
  }

  const raw = await readFile(inventoryFilePath, "utf8");
  const parsed = JSON.parse(raw) as { items?: unknown };
  const items = Array.isArray(parsed.items)
    ? parsed.items.map(parseInventoryItem).filter((item): item is InventoryItem => item !== null)
    : [];

  return {
    items,
  };
}

export async function writeInventoryState(state: InventoryState) {
  const inventoryFilePath = getInventoryFilePath();
  await ensureInventoryDir();
  await writeFile(inventoryFilePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function hydrateInventory(items: InventoryItem[]) {
  await writeInventoryState({
    items,
  });
}

export async function listInventoryItems() {
  const state = await readInventoryState();
  return state.items;
}

function formatDisplayName(resourceType: string) {
  return resourceType
    .split(/[-_]/g)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export async function addInventoryItem(resourceType: string, quantity: number, unit = "units") {
  const state = await readInventoryState();
  const existingItem = state.items.find((item) => item.resourceType === resourceType);

  if (existingItem) {
    existingItem.quantity += quantity;
    if (!existingItem.displayName) {
      existingItem.displayName = formatDisplayName(resourceType);
    }
    if (!existingItem.unit) {
      existingItem.unit = unit;
    }
  } else {
    state.items.push({
      resourceType,
      displayName: formatDisplayName(resourceType),
      quantity,
      unit,
    });
  }

  await writeInventoryState(state);
}

export async function spendInventoryResources(required: Record<string, number>) {
  const state = await readInventoryState();
  state.items = state.items.map((item) => {
    const amountToSpend = required[item.resourceType] ?? 0;

    if (amountToSpend <= 0) {
      return item;
    }

    return {
      ...item,
      quantity: Math.max(0, item.quantity - amountToSpend),
    };
  });

  await writeInventoryState(state);
}
