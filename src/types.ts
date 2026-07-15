export type ModuleRuntimeAttributes = Record<string, unknown>;

export type JsonSchemaLike = Record<string, unknown>;

export type HabitatModule = {
  id: string;
  slug: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: ModuleRuntimeAttributes;
  capabilities: string[];
};

export type HabitatHuman = {
  id: string;
  displayName: string;
  locationModuleId: string;
};

export type EvaCarriedResources = Record<string, number>;

export type EvaState = {
  habitatId: string | null;
  deployedHumanId: string | null;
  x: number;
  y: number;
  carriedResources: EvaCarriedResources;
  maxCarryingCapacityKg: number;
};

export type AlertContract = {
  schemaVersion: string;
  schema: JsonSchemaLike;
};

export type RegistrationContracts = {
  alerts: AlertContract;
};

export type HabitatModuleState = {
  habitatId: string | null;
  modules: HabitatModule[];
};

export type InventoryItem = {
  resourceType: string;
  displayName: string;
  quantity: number;
  unit: string;
};

export type InventoryState = {
  items: InventoryItem[];
};

export type ConstructionJob = {
  id: string;
  blueprintId: string;
  outputModuleType: string;
  outputDisplayName: string;
  facilityModuleSlug: string;
  startedAtTick: number;
  remainingBuildTicks: number;
  spentResources: Record<string, number>;
  runtimeAttributes: ModuleRuntimeAttributes;
  capabilities: string[];
  status: "active" | "complete";
};

export type ConstructionState = {
  jobs: ConstructionJob[];
};
