export type RuntimeAttributes = Record<string, unknown>;

export type HabitatModule = {
  id: string;
  slug: string;
  blueprintId: string;
  displayName: string;
  connectedTo: string[];
  runtimeAttributes: RuntimeAttributes;
  capabilities: string[];
};

export type RegistrationStatus = {
  habitatUuid: string | null;
  habitatId: string | null;
  displayName: string;
  registeredAt: string;
  status: string;
  registrationId: string | null;
};

export type StatusResponse = {
  currentTick: number;
  moduleCount: number;
  registration: RegistrationStatus | null;
};

export type RegistrationResponse = {
  registration: {
    habitatUuid: string | null;
    habitatId: string | null;
    displayName: string;
  } | null;
};

export type StateResponse = {
  registration: {
    habitatName: string;
    registeredAt: string;
    status: string;
    habitatId: string | null;
    registrationId: string | null;
    unregisterUrl: string | null;
  } | null;
  modules: {
    habitatId: string | null;
    modules: HabitatModule[];
  };
  inventory: {
    items: Array<{
      resourceType: string;
      displayName: string;
      quantity: number;
      unit: string;
    }>;
  };
  construction: {
    jobs: Array<{
      id: string;
      blueprintId: string;
      status: string;
      remainingBuildTicks: number;
    }>;
  };
  simulation: {
    currentTick: number;
  };
  humans: {
    habitatId: string | null;
    humans: Array<{
      id: string;
      displayName: string;
      locationModuleId: string;
    }>;
  };
};

export type SolarResponse = {
  solarIrradiance: {
    wPerM2: number;
    condition: string;
  } | null;
};

export type TickSummary = {
  ticksRequested: number;
  ticksApplied: number;
  startTick: number;
  endTick: number;
  totalPowerDrawKw: number;
  batteryDrainKwh: number;
  batteryEnergyBeforeKwh: number;
  batteryEnergyAfterKwh: number;
  batteryDrainedKwh: number;
  solarIrradianceWPerM2: number | null;
  solarCondition: string | null;
  solarModuleCount: number;
  solarGenerationKw: number;
  solarGeneratedKwh: number;
  solarChargeAppliedKwh: number;
  solarChargingReport: string;
};

export type TickResponse = {
  summary: TickSummary;
};
