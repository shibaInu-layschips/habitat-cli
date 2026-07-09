import { getModulePowerDrawKw, getModuleStatus, getModuleSolarGenerationKw } from "./power-simulation";
import type { HabitatModule } from "./types";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
}

function padCell(value: string, width: number) {
  return value.padEnd(width, " ");
}

function getDeclaredStatus(module: HabitatModule) {
  const runtimeAttributes = module.runtimeAttributes as Record<string, unknown>;
  return typeof runtimeAttributes.status === "string" ? runtimeAttributes.status : "unknown";
}

export function formatPowerOverview(modules: HabitatModule[]) {
  const rows = modules.map((module) => ({
    module: module.slug,
    state: getDeclaredStatus(module),
    effectiveness: getModuleStatus(module),
    powerDrawKw: `${formatNumber(getModulePowerDrawKw(module))} kW`,
    solarGenerationKw: `${formatNumber(getModuleSolarGenerationKw(module))} kW`,
  }));

  const moduleWidth = Math.max("Module".length, ...rows.map((row) => row.module.length));
  const stateWidth = Math.max("State".length, ...rows.map((row) => row.state.length));
  const effectivenessWidth = Math.max("Effectiveness".length, ...rows.map((row) => row.effectiveness.length));
  const drawWidth = Math.max("Power Draw (kW)".length, ...rows.map((row) => row.powerDrawKw.length));
  const generationWidth = Math.max("Solar Generation (kW)".length, ...rows.map((row) => row.solarGenerationKw.length));

  const totalPowerDrawKw = modules.reduce((total, module) => total + getModulePowerDrawKw(module), 0);
  const totalSolarGenerationKw = modules.reduce((total, module) => total + getModuleSolarGenerationKw(module), 0);
  const netPowerKw = totalPowerDrawKw - totalSolarGenerationKw;

  return [
    `${padCell("Module", moduleWidth)}  ${padCell("State", stateWidth)}  ${padCell("Effectiveness", effectivenessWidth)}  ${padCell("Power Draw (kW)", drawWidth)}  ${padCell("Solar Generation (kW)", generationWidth)}`,
    `${"-".repeat(moduleWidth)}  ${"-".repeat(stateWidth)}  ${"-".repeat(effectivenessWidth)}  ${"-".repeat(drawWidth)}  ${"-".repeat(generationWidth)}`,
    ...rows.map(
      (row) =>
        `${padCell(row.module, moduleWidth)}  ${padCell(row.state, stateWidth)}  ${padCell(row.effectiveness, effectivenessWidth)}  ${padCell(row.powerDrawKw, drawWidth)}  ${padCell(row.solarGenerationKw, generationWidth)}`,
    ),
    `Total Power Draw: ${formatNumber(totalPowerDrawKw)} kW | Total Solar Generation: ${formatNumber(totalSolarGenerationKw)} kW | Net Power: ${formatNumber(netPowerKw)} kW`,
  ].join("\n");
}
