export type ModuleRuntimeAttributes = Record<string, unknown>;

export type HabitatModule = {
  id: string;
  slug: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: ModuleRuntimeAttributes;
  capabilities: string[];
};

export type HabitatModuleState = {
  habitatId: string | null;
  modules: HabitatModule[];
};
