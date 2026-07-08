import type { KeplerBlueprint } from "./kepler-blueprints";

function padCell(value: string, width: number) {
  return value.padEnd(width, " ");
}

export function formatBlueprintList(blueprints: KeplerBlueprint[]) {
  const rows = blueprints.map((blueprint) => ({
    blueprintId: blueprint.blueprintId,
    displayName: blueprint.displayName,
    buildTicks: String(blueprint.buildTicks),
    status: blueprint.status || "unknown",
  }));

  const idWidth = Math.max("Blueprint ID".length, ...rows.map((row) => row.blueprintId.length));
  const nameWidth = Math.max("Display Name".length, ...rows.map((row) => row.displayName.length));
  const tickWidth = Math.max("Build Ticks".length, ...rows.map((row) => row.buildTicks.length));
  const statusWidth = Math.max("Status".length, ...rows.map((row) => row.status.length));

  return [
    `${padCell("Blueprint ID", idWidth)}  ${padCell("Display Name", nameWidth)}  ${padCell("Build Ticks", tickWidth)}  ${padCell("Status", statusWidth)}`,
    `${"-".repeat(idWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(tickWidth)}  ${"-".repeat(statusWidth)}`,
    ...rows.map(
      (row) =>
        `${padCell(row.blueprintId, idWidth)}  ${padCell(row.displayName, nameWidth)}  ${padCell(row.buildTicks, tickWidth)}  ${padCell(row.status, statusWidth)}`,
    ),
  ].join("\n");
}
