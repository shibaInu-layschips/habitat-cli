import { describe, expect, test } from "bun:test";
import { formatWorldScanDetail, formatWorldScanSummary } from "../src/world-scan-report";

describe("world scan report", () => {
  test("shows exact quantity details for an origin-tile strength-100 scan", () => {
    const responseBody = {
      scan: {
        tiles: [
          {
            x: 3,
            y: -2,
            terrain: "flat",
            distanceTiles: 0,
            probabilities: [
              {
                resourceType: "ferrite",
                probabilityPct: 100,
              },
              {
                resourceType: "basalt-composite",
                probabilityPct: 0,
              },
              {
                resourceType: null,
                probabilityPct: 0,
              },
            ],
            topCandidate: {
              resourceType: "ferrite",
              probabilityPct: 100,
            },
            quantityEstimate: {
              exact: true,
              minimumKg: 12,
              maximumKg: 12,
              estimatedKg: 12,
            },
          },
        ],
      },
    };

    const report = formatWorldScanDetail(responseBody);

    expect(report).toContain("Tile: (3, -2)");
    expect(report).toContain("Estimated Quantity: 12 kg (exact; min 12 kg, max 12 kg)");
    expect(report).toContain("ferrite | 100% | 12");
    expect(report).toContain("basalt-composite | 0% | 12");
    expect(report).toContain("No Resource | 0% | 12");
  });

  test("uses the quantity estimate object in larger-radius summary rows", () => {
    const responseBody = {
      scan: {
        tiles: [
          {
            x: 3,
            y: -2,
            terrain: "flat",
            distanceTiles: 0,
            probabilities: [
              {
                resourceType: "ferrite",
                probabilityPct: 100,
              },
            ],
            topCandidate: {
              resourceType: "ferrite",
              probabilityPct: 100,
            },
            quantityEstimate: {
              exact: true,
              minimumKg: 12,
              maximumKg: 12,
              estimatedKg: 12,
            },
          },
          {
            x: 4,
            y: -2,
            terrain: "ridge",
            distanceTiles: 1,
            probabilities: [
              {
                resourceType: "ice-regolith",
                probabilityPct: 61.5,
              },
              {
                resourceType: "ferrite",
                probabilityPct: 38.5,
              },
            ],
            topCandidate: {
              resourceType: "ice-regolith",
              probabilityPct: 61.5,
            },
            quantityEstimate: {
              exact: false,
              minimumKg: 8,
              maximumKg: 13,
              estimatedKg: 10,
            },
          },
        ],
      },
    };

    const report = formatWorldScanSummary(responseBody);

    expect(report).toContain("(3, -2)");
    expect(report).toContain("(4, -2)");
    expect(report).toContain("ferrite");
    expect(report).toContain("100%");
    expect(report).toContain("ice-regolith");
    expect(report).toContain("61.5%");
    expect(report).toContain("| 12");
    expect(report).toContain("| 10");
  });

  test("uses Kepler's explicit top candidate in summary output, including no-resource tiles", () => {
    const responseBody = {
      scan: {
        tiles: [
          {
            x: 3,
            y: -2,
            terrain: "flat",
            distanceTiles: 0,
            probabilities: [
              {
                resourceType: null,
                probabilityPct: 100,
              },
              {
                resourceType: "ferrite",
                probabilityPct: 0,
              },
            ],
            topCandidate: {
              resourceType: null,
              probabilityPct: 100,
            },
            quantityEstimate: null,
          },
        ],
      },
    };

    const report = formatWorldScanSummary(responseBody);

    expect(report).toContain("No Resource");
    expect(report).toContain("100%");
    expect(report).not.toContain("ferrite          | 0%");
  });
});
