import type { KeplerBlueprint } from "./kepler-blueprints";

function padCell(value: string, width: number) {
  return value.padEnd(width, " ");
}

function formatKeyValueTable(
  headers: { left: string; right: string },
  rows: Array<{ left: string; right: string }>,
) {
  const leftWidth = Math.max(headers.left.length, ...rows.map((row) => row.left.length));
  const rightWidth = Math.max(headers.right.length, ...rows.map((row) => row.right.length));

  return [
    `${padCell(headers.left, leftWidth)}  ${padCell(headers.right, rightWidth)}`,
    `${"-".repeat(leftWidth)}  ${"-".repeat(rightWidth)}`,
    ...rows.map((row) => `${padCell(row.left, leftWidth)}  ${padCell(row.right, rightWidth)}`),
  ].join("\n");
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

export function formatBlueprintInputs(inputs: Record<string, unknown>) {
  const rows = Object.entries(inputs)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
    .map(([resource, amount]) => ({
      left: resource,
      right: String(amount),
    }));

  if (rows.length === 0) {
    return "None";
  }

  return formatKeyValueTable(
    { left: "Resource", right: "Amount" },
    rows,
  );
}

export function formatBlueprintRuntimeAttributes(runtimeAttributes: Record<string, unknown>) {
  const rows = Object.entries(runtimeAttributes).map(([attribute, value]) => ({
    left: attribute,
    right:
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
  }));

  if (rows.length === 0) {
    return "None";
  }

  return formatKeyValueTable(
    { left: "Attribute", right: "Value" },
    rows,
  );
}
