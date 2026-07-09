import type { SolarIrradianceReading } from "./kepler-irradiance";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
}

export function formatSolarStatus(reading: SolarIrradianceReading) {
  return [
    "Solar Status",
    `Irradiance: ${formatNumber(reading.wPerM2)} W/m^2`,
    `Condition: ${reading.condition}`,
  ].join("\n");
}
