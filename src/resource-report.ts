import type { KeplerResource } from "./kepler-resources";

function padCell(value: string, width: number) {
  return value.padEnd(width, " ");
}

export function formatResourceList(resources: KeplerResource[]) {
  const rows = resources.map((resource) => ({
    resourceType: resource.resourceType,
    displayName: resource.displayName,
    kind: resource.kind || "unknown",
    rarity: resource.rarity || "unknown",
  }));

  const typeWidth = Math.max("Resource Type".length, ...rows.map((row) => row.resourceType.length));
  const nameWidth = Math.max("Display Name".length, ...rows.map((row) => row.displayName.length));
  const kindWidth = Math.max("Kind".length, ...rows.map((row) => row.kind.length));
  const rarityWidth = Math.max("Rarity".length, ...rows.map((row) => row.rarity.length));

  return [
    `${padCell("Resource Type", typeWidth)}  ${padCell("Display Name", nameWidth)}  ${padCell("Kind", kindWidth)}  ${padCell("Rarity", rarityWidth)}`,
    `${"-".repeat(typeWidth)}  ${"-".repeat(nameWidth)}  ${"-".repeat(kindWidth)}  ${"-".repeat(rarityWidth)}`,
    ...rows.map(
      (row) =>
        `${padCell(row.resourceType, typeWidth)}  ${padCell(row.displayName, nameWidth)}  ${padCell(row.kind, kindWidth)}  ${padCell(row.rarity, rarityWidth)}`,
    ),
  ].join("\n");
}
