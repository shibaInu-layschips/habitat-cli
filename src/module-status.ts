import { getModulePowerDrawKw, getModuleStatus, getTotalPowerDrawKw } from "./power-simulation";
import type { HabitatModule } from "./types";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
}

function padCell(value: string, width: number) {
  return value.padEnd(width, " ");
}

export function formatModuleStatusReport(modules: HabitatModule[]) {
  const rows = modules.map((module) => ({
    name: module.displayName,
    state: getModuleStatus(module),
    powerDrawKw: getModulePowerDrawKw(module),
  }));

  const nameWidth = Math.max("Module".length, ...rows.map((row) => row.name.length));
  const stateWidth = Math.max("State".length, ...rows.map((row) => row.state.length));
  const drawWidth = Math.max("Power Draw (kW)".length, ...rows.map((row) => formatNumber(row.powerDrawKw).length));

  const lines = [
    `${padCell("Module", nameWidth)}  ${padCell("State", stateWidth)}  ${padCell("Power Draw (kW)", drawWidth)}`,
    `${"-".repeat(nameWidth)}  ${"-".repeat(stateWidth)}  ${"-".repeat(drawWidth)}`,
    ...rows.map((row) =>
      `${padCell(row.name, nameWidth)}  ${padCell(row.state, stateWidth)}  ${padCell(formatNumber(row.powerDrawKw), drawWidth)}`,
    ),
  ];

  const totalPowerDrawKw = getTotalPowerDrawKw(modules);
  const tickEnergyCostKwh = totalPowerDrawKw / 3600;

  return `${lines.join("\n")}\nTotal Power Draw: ${formatNumber(totalPowerDrawKw)} kW | Tick Energy Cost: ${formatNumber(tickEnergyCostKwh)} kWh`;
}

export function formatModuleListReport(modules: HabitatModule[]) {
  const rows = modules.map((module) => ({
    slug: module.slug,
    displayName: module.displayName,
    status: getModuleStatus(module),
    condition:
      typeof module.runtimeAttributes.condition === "number"
        ? formatNumber(module.runtimeAttributes.condition)
        : "unknown",
    powerDrawKw: `${formatNumber(getModulePowerDrawKw(module))} kW`,
  }));

  const slugWidth = Math.max("Module".length, ...rows.map((row) => row.slug.length));
  const nameWidth = Math.max("Display Name".length, ...rows.map((row) => row.displayName.length));
  const statusWidth = Math.max("Status".length, ...rows.map((row) => row.status.length));
  const conditionWidth = Math.max("Condition".length, ...rows.map((row) => row.condition.length));
  const drawWidth = Math.max("Power Draw (kW)".length, ...rows.map((row) => row.powerDrawKw.length));

  return [
    `${padCell("Module", slugWidth)}  ${padCell("Display Name", nameWidth)}  ${padCell("Status", statusWidth)}  ${padCell("Condition", conditionWidth)}  ${padCell("Power Draw (kW)", drawWidth)}`,
    `${"-".repeat(slugWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(conditionWidth)}  ${"-".repeat(drawWidth)}`,
    ...rows.map(
      (row) =>
        `${padCell(row.slug, slugWidth)}  ${padCell(row.displayName, nameWidth)}  ${padCell(row.status, statusWidth)}  ${padCell(row.condition, conditionWidth)}  ${padCell(row.powerDrawKw, drawWidth)}`,
    ),
  ].join("\n");
}
