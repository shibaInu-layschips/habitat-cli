import { listInventoryItems } from "./inventory-storage";
import { findActiveJobByFacility } from "./construction-storage";
import { listModules } from "./module-storage";
import { type KeplerBlueprint } from "./kepler-blueprints";
import { findBatteryModule, getModuleStatus } from "./power-simulation";
import type { HabitatModule, InventoryItem } from "./types";

export type ConstructionCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

export type ConstructionDryRunResult = {
  blueprint: KeplerBlueprint;
  requiredFacilityExists: ConstructionCheck;
  fabricatorAvailable: ConstructionCheck;
  supplyCacheOnline: ConstructionCheck;
  prerequisitesMet: ConstructionCheck;
  inventoryEnough: ConstructionCheck;
  facilityModuleSlug: string | null;
  canStart: boolean;
  startDetail: string;
  checks: ConstructionCheck[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumberRecord(value: unknown) {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => {
      const [, amount] = entry;
      return typeof amount === "number" && Number.isFinite(amount);
    }),
  );
}

function isUsableModuleStatus(status: string) {
  return status === "idle" || status === "online" || status === "active";
}

function checkRequiredFacilityExists(blueprint: KeplerBlueprint, modules: HabitatModule[]): ConstructionCheck {
  const moduleType = blueprint.requiredFacility?.moduleType;

  if (!moduleType) {
    return {
      label: "Required Facility Exists",
      passed: false,
      detail: "Blueprint does not declare a required construction facility.",
    };
  }

  const facilityExists = modules.some((module) => module.blueprintId === moduleType);
  return {
    label: "Required Facility Exists",
    passed: facilityExists,
    detail: facilityExists
      ? `Found required facility "${moduleType}".`
      : `Missing required facility "${moduleType}".`,
  };
}

async function checkFabricatorAvailable(blueprint: KeplerBlueprint, modules: HabitatModule[]): Promise<ConstructionCheck> {
  const moduleType = blueprint.requiredFacility?.moduleType;

  if (!moduleType) {
    return {
      label: "Fabricator Available",
      passed: false,
      detail: "Blueprint does not declare a required construction facility.",
    };
  }

  const facility = modules.find((module) => module.blueprintId === moduleType);

  if (!facility) {
    return {
      label: "Fabricator Available",
      passed: false,
      detail: `No local "${moduleType}" is available to build this module.`,
    };
  }

  const activeJob = await findActiveJobByFacility(facility.slug);

  if (activeJob) {
    return {
      label: "Fabricator Available",
      passed: false,
      detail: `${facility.slug} is already busy with another construction job.`,
    };
  }

  const status = getModuleStatus(facility);
  const passed = isUsableModuleStatus(status);

  return {
    label: "Fabricator Available",
    passed,
    detail: passed
      ? `${facility.slug} is ${status} and available.`
      : `${facility.slug} is ${status} and not available.`,
  };
}

function checkPrerequisites(blueprint: KeplerBlueprint, modules: HabitatModule[]): ConstructionCheck {
  if (blueprint.prerequisites.length === 0) {
    return {
      label: "Prerequisites Met",
      passed: true,
      detail: "No prerequisite modules or capabilities are required.",
    };
  }

  const available = new Set<string>();

  for (const module of modules) {
    available.add(module.blueprintId);
    for (const capability of module.capabilities) {
      available.add(capability);
    }
  }

  const missing = blueprint.prerequisites.filter((entry) => !available.has(entry));

  return {
    label: "Prerequisites Met",
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? "All prerequisite modules or capabilities are present."
        : `Missing prerequisites: ${missing.join(", ")}.`,
  };
}

function checkSupplyCacheOnline(modules: HabitatModule[]): ConstructionCheck {
  const supplyCache = modules.find((module) => module.blueprintId === "supply-cache");

  if (!supplyCache) {
    return {
      label: "Supply Cache Online",
      passed: false,
      detail: "No supply cache module was found.",
    };
  }

  const status = getModuleStatus(supplyCache);
  const passed = isUsableModuleStatus(status);

  return {
    label: "Supply Cache Online",
    passed,
    detail: passed ? `${supplyCache.slug} is ${status}.` : `${supplyCache.slug} is ${status}.`,
  };
}

function checkInventoryEnough(blueprint: KeplerBlueprint, inventoryItems: InventoryItem[]): ConstructionCheck {
  const requiredResources = asNumberRecord(blueprint.inputs);
  const inventoryByType = new Map(inventoryItems.map((item) => [item.resourceType, item.quantity]));
  const shortages = Object.entries(requiredResources).filter(([resourceType, requiredQuantity]) => {
    return (inventoryByType.get(resourceType) ?? 0) < requiredQuantity;
  });

  return {
    label: "Inventory Enough",
    passed: shortages.length === 0,
    detail:
      shortages.length === 0
        ? "Local inventory contains all required construction materials."
        : `Missing resources: ${shortages
            .map(([resourceType, requiredQuantity]) => {
              const available = inventoryByType.get(resourceType) ?? 0;
              return `${resourceType} (${available}/${requiredQuantity})`;
            })
            .join(", ")}.`,
  };
}

function checkPower(modules: HabitatModule[]): ConstructionCheck {
  const batteryModule = findBatteryModule(modules);

  if (!batteryModule) {
    return {
      label: "Power",
      passed: false,
      detail: "No battery or power storage module was found.",
    };
  }

  const status = getModuleStatus(batteryModule);
  const currentEnergy =
    typeof batteryModule.runtimeAttributes.currentEnergyKwh === "number"
      ? batteryModule.runtimeAttributes.currentEnergyKwh
      : 0;
  const passed = isUsableModuleStatus(status) && currentEnergy > 0;

  return {
    label: "Power",
    passed,
    detail: passed
      ? `${batteryModule.slug} has ${currentEnergy} kWh available.`
      : `${batteryModule.slug} is ${status} with ${currentEnergy} kWh available.`,
  };
}

export async function evaluateConstructionDryRun(blueprint: KeplerBlueprint): Promise<ConstructionDryRunResult> {
  const [modules, inventoryItems] = await Promise.all([listModules(), listInventoryItems()]);
  const requiredFacilityExists = checkRequiredFacilityExists(blueprint, modules);
  const fabricatorAvailable = await checkFabricatorAvailable(blueprint, modules);
  const prerequisitesMet = checkPrerequisites(blueprint, modules);
  const supplyCacheOnline = checkSupplyCacheOnline(modules);
  const inventoryEnough = checkInventoryEnough(blueprint, inventoryItems);
  const powerReady = checkPower(modules);
  const facilityModuleSlug =
    blueprint.requiredFacility?.moduleType
      ? modules.find((module) => module.blueprintId === blueprint.requiredFacility?.moduleType)?.slug ?? null
      : null;
  const blueprintIsBuildable =
    blueprint.status === "published" &&
    blueprint.output.itemType === "module" &&
    typeof blueprint.output.moduleType === "string" &&
    blueprint.output.moduleType.length > 0;
  const checks = [
    requiredFacilityExists,
    fabricatorAvailable,
    supplyCacheOnline,
    prerequisitesMet,
    inventoryEnough,
    powerReady,
  ];
  const canStart = blueprintIsBuildable && checks.every((check) => check.passed);
  const startDetail = canStart
    ? "All local construction checks passed."
    : powerReady.passed
      ? "Construction cannot start until all failed checks are resolved."
      : `Construction also requires usable power. ${powerReady.detail}`;

  return {
    blueprint,
    requiredFacilityExists,
    fabricatorAvailable,
    supplyCacheOnline,
    prerequisitesMet,
    inventoryEnough,
    facilityModuleSlug,
    canStart,
    startDetail,
    checks,
  };
}
