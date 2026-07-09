import { getModulePowerDrawKw, getModuleStatus } from "./power-simulation";
import type { ConstructionJob, HabitatModule } from "./types";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((entry) => formatValue(entry)).join(", ") : "None";
  }

  if (value && typeof value === "object") {
    return "See nested entries";
  }

  return "None";
}

function appendValueLines(lines: string[], label: string, value: unknown, indent = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      lines.push(`${indent}${label}: None`);
      return;
    }

    lines.push(`${indent}${label}:`);
    for (const [childLabel, childValue] of entries) {
      appendValueLines(lines, childLabel, childValue, `${indent}  `);
    }
    return;
  }

  lines.push(`${indent}${label}: ${formatValue(value)}`);
}

function formatRuntimeAttributes(runtimeAttributes: Record<string, unknown>) {
  const entries = Object.entries(runtimeAttributes);

  if (entries.length === 0) {
    return ["None"];
  }

  const lines: string[] = [];

  for (const [label, value] of entries) {
    appendValueLines(lines, label, value);
  }

  return lines;
}

function getDeclaredStatus(module: HabitatModule) {
  const runtimeAttributes = module.runtimeAttributes as Record<string, unknown>;
  return typeof runtimeAttributes.status === "string" ? runtimeAttributes.status : "unknown";
}

function getCondition(module: HabitatModule) {
  const runtimeAttributes = module.runtimeAttributes as Record<string, unknown>;
  return typeof runtimeAttributes.condition === "number" ? formatNumber(runtimeAttributes.condition) : "unknown";
}

function isBatteryModule(module: HabitatModule) {
  return (
    module.capabilities.includes("power-storage") ||
    module.blueprintId.includes("battery") ||
    module.slug.includes("battery")
  );
}

function formatConstructionJob(job: ConstructionJob) {
  const lines = [
    `Job ID: ${job.id}`,
    `Blueprint: ${job.blueprintId}`,
    `Output Module: ${job.outputModuleType}`,
    `Output Display Name: ${job.outputDisplayName}`,
    `Facility: ${job.facilityModuleSlug}`,
    `Status: ${job.status}`,
    `Remaining Build Ticks: ${job.remainingBuildTicks}`,
    "Spent Resources",
    ...formatRuntimeAttributes(job.spentResources).map((line) => `  ${line}`),
    "Runtime Attributes",
    ...formatRuntimeAttributes(job.runtimeAttributes).map((line) => `  ${line}`),
    `Capabilities: ${job.capabilities.length > 0 ? job.capabilities.join(", ") : "None"}`,
  ];

  return lines.join("\n");
}

function formatBatteryDetails(module: HabitatModule) {
  const runtimeAttributes = module.runtimeAttributes as Record<string, unknown>;
  const currentEnergy = typeof runtimeAttributes.currentEnergyKwh === "number" ? runtimeAttributes.currentEnergyKwh : 0;
  const storageEnergy = typeof runtimeAttributes.energyStorageKwh === "number" ? runtimeAttributes.energyStorageKwh : 0;
  const reserveEnergy = typeof runtimeAttributes.reserveKwh === "number" ? runtimeAttributes.reserveKwh : 0;
  const maxPowerOutput = typeof runtimeAttributes.maxPowerOutputKw === "number" ? runtimeAttributes.maxPowerOutputKw : 0;

  return [
    `Current Energy: ${formatNumber(currentEnergy)} kWh`,
    `Storage Capacity: ${formatNumber(storageEnergy)} kWh`,
    `Reserve: ${formatNumber(reserveEnergy)} kWh`,
    `Max Power Output: ${formatNumber(maxPowerOutput)} kW`,
  ];
}

function formatConstructionSummary(activeJob: ConstructionJob | null) {
  if (!activeJob) {
    return ["Active Construction Job: None"];
  }

  return [
    "Active Construction Job",
    `Job ID: ${activeJob.id}`,
    `Blueprint: ${activeJob.blueprintId}`,
    `Output Module: ${activeJob.outputModuleType}`,
    `Remaining Build Ticks: ${activeJob.remainingBuildTicks}`,
  ];
}

export function formatModuleStatusDetails(module: HabitatModule, activeJob: ConstructionJob | null) {
  return [
    "Module Status",
    `Module: ${module.slug}`,
    `Kepler ID: ${module.id}`,
    `Blueprint ID: ${module.blueprintId}`,
    `Display Name: ${module.displayName}`,
    `Declared State: ${getDeclaredStatus(module)}`,
    `Effective State: ${getModuleStatus(module)}`,
    `Condition: ${getCondition(module)}`,
    `Current Power Draw: ${formatNumber(getModulePowerDrawKw(module))} kW`,
    `Capabilities: ${module.capabilities.length > 0 ? module.capabilities.join(", ") : "None"}`,
    `Connected To: ${module.connectedTo.length > 0 ? module.connectedTo.join(", ") : "None"}`,
    ...formatConstructionSummary(activeJob),
  ].join("\n");
}

export function formatModuleInfo(module: HabitatModule, activeJob: ConstructionJob | null) {
  const runtimeAttributes = module.runtimeAttributes as Record<string, unknown>;
  const lines = [
    "Module Info",
    `Module: ${module.slug}`,
    `Kepler ID: ${module.id}`,
    `Blueprint ID: ${module.blueprintId}`,
    `Display Name: ${module.displayName}`,
    `Declared State: ${getDeclaredStatus(module)}`,
    `Effective State: ${getModuleStatus(module)}`,
    `Condition: ${getCondition(module)}`,
    `Capabilities: ${module.capabilities.length > 0 ? module.capabilities.join(", ") : "None"}`,
    `Connected To: ${module.connectedTo.length > 0 ? module.connectedTo.join(", ") : "None"}`,
    "",
    "Runtime Attributes",
    ...formatRuntimeAttributes(runtimeAttributes).map((line) => `  ${line}`),
    "",
    ...(activeJob ? ["Active Construction Job", formatConstructionJob(activeJob)] : ["Active Construction Job: None"]),
  ];

  if (isBatteryModule(module)) {
    lines.push("", "Battery Details", ...formatBatteryDetails(module));
  }

  return lines.join("\n");
}
