import { getHabitatApiJson, putHabitatApiJson } from "./habitat-api-client";
import { getSqliteDatabaseFilePath, readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { InventoryItem, InventoryState } from "./types";

const INVENTORY_STATE_NAMESPACE = "inventory";

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

function readInventoryStateBlob(): InventoryState {
  const raw = readStateBlob(INVENTORY_STATE_NAMESPACE);

  if (!raw) {
    return defaultInventoryState();
  }

  try {
    const parsed = JSON.parse(raw) as { items?: unknown };
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(parseInventoryItem).filter((item): item is InventoryItem => item !== null)
      : [];

    return {
      items,
    };
  } catch {
    return defaultInventoryState();
  }
}

function writeInventoryStateBlob(state: InventoryState) {
  writeStateBlob(INVENTORY_STATE_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

function shouldUseLocalInventoryStorage() {
  return process.env.HABITAT_BACKEND_RUNTIME === "1" || !process.env.HABITAT_API_BASE_URL?.trim();
}

async function readInventoryStateRemote(): Promise<InventoryState> {
  return await getHabitatApiJson<InventoryState>("/inventory");
}

async function writeInventoryStateRemote(state: InventoryState) {
  return await putHabitatApiJson<InventoryState>("/inventory", state);
}

export function getInventoryFilePath() {
  return getSqliteDatabaseFilePath();
}

export async function readInventoryState(): Promise<InventoryState> {
  if (shouldUseLocalInventoryStorage()) {
    return readInventoryStateBlob();
  }

  return await readInventoryStateRemote();
}

export async function writeInventoryState(state: InventoryState) {
  if (shouldUseLocalInventoryStorage()) {
    writeInventoryStateBlob(state);
    return;
  }

  await writeInventoryStateRemote(state);
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

export async function removeInventoryItem(resourceType: string, quantity: number) {
  const state = await readInventoryState();
  const existingItem = state.items.find((item) => item.resourceType === resourceType);

  if (!existingItem) {
    return false;
  }

  existingItem.quantity = Math.max(0, existingItem.quantity - quantity);
  if (existingItem.quantity === 0) {
    state.items = state.items.filter((item) => item.resourceType !== resourceType);
  }

  await writeInventoryState(state);
  return true;
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
