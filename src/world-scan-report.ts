type WorldScanCandidate = {
  resourceType: string;
  displayName: string;
  probability: number;
  probabilityIsPercent: boolean;
  estimatedQuantity: number | null;
};

type WorldScanTile = {
  x: number;
  y: number;
  distance: number;
  terrain: string;
  resources: WorldScanCandidate[];
  topCandidate: WorldScanCandidate | null;
  quantityEstimate: {
    exact: boolean;
    minimumKg: number;
    maximumKg: number;
    estimatedKg: number;
  } | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatKilograms(value: number) {
  return `${formatNumber(value)} kg`;
}

function formatProbability(value: number, probabilityIsPercent: boolean) {
  const percent = probabilityIsPercent ? value : value <= 1 ? value * 100 : value;
  return `${formatNumber(percent)}%`;
}

function pad(value: string, width: number) {
  return value.padEnd(width, " ");
}

function parseQuantityEstimate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      exact: false,
      minimumKg: value,
      maximumKg: value,
      estimatedKg: value,
    };
  }

  if (!isObject(value)) {
    return null;
  }

  const exact = value.exact === true;
  const minimumKg = asNumber(value.minimumKg) ?? asNumber(value.minKg);
  const maximumKg = asNumber(value.maximumKg) ?? asNumber(value.maxKg);
  const estimatedKg = asNumber(value.estimatedKg) ?? asNumber(value.kg) ?? asNumber(value.estimateKg);

  if (minimumKg === null || maximumKg === null || estimatedKg === null) {
    return null;
  }

  return {
    exact,
    minimumKg,
    maximumKg,
    estimatedKg,
  };
}

function parseCandidate(value: unknown): WorldScanCandidate | null {
  if (!isObject(value)) {
    return null;
  }

  const rawResourceType = value.resourceType;
  const resourceType =
    typeof rawResourceType === "string" && rawResourceType.length > 0 ? rawResourceType : "none";
  const displayName =
    asString(value.displayName) ||
    (resourceType === "none" ? "No Resource" : resourceType);
  const directProbability = asNumber(value.probability);
  const percentProbability = asNumber(value.probabilityPct);
  const probability = directProbability ?? percentProbability;
  const estimatedQuantity = asNumber(value.estimatedQuantity);

  if (!displayName || probability === null) {
    return null;
  }

  return {
    resourceType,
    displayName,
    probability,
    probabilityIsPercent: directProbability === null && percentProbability !== null,
    estimatedQuantity,
  };
}

function parseTile(value: unknown): WorldScanTile | null {
  if (!isObject(value)) {
    return null;
  }

  const x = asNumber(value.x);
  const y = asNumber(value.y);
  const distance = asNumber(value.distance) ?? asNumber(value.distanceTiles);
  const terrain = asString(value.terrain);
  const candidateValues = Array.isArray(value.resources)
    ? value.resources
    : Array.isArray(value.probabilities)
      ? value.probabilities
      : [];
  const resources = candidateValues
    .map(parseCandidate)
    .filter((candidate): candidate is WorldScanCandidate => candidate !== null);

  if (x === null || y === null || distance === null || !terrain) {
    return null;
  }

  return {
    x,
    y,
    distance,
    terrain,
    resources,
    topCandidate: parseCandidate(value.topCandidate),
    quantityEstimate: parseQuantityEstimate(value.quantityEstimate),
  };
}

function formatQuantityEstimateSummary(quantityEstimate: WorldScanTile["quantityEstimate"]) {
  if (!quantityEstimate) {
    return "Unknown";
  }

  return formatNumber(quantityEstimate.estimatedKg);
}

function formatQuantityEstimateDetail(quantityEstimate: WorldScanTile["quantityEstimate"]) {
  if (!quantityEstimate) {
    return "Unknown";
  }

  const exactText = quantityEstimate.exact ? "exact" : "estimated";
  return `${formatKilograms(quantityEstimate.estimatedKg)} (${exactText}; min ${formatKilograms(quantityEstimate.minimumKg)}, max ${formatKilograms(quantityEstimate.maximumKg)})`;
}

export function parseWorldScanTiles(responseBody: unknown) {
  const tileValues =
    isObject(responseBody) && Array.isArray(responseBody.tiles)
      ? responseBody.tiles
      : isObject(responseBody) && isObject(responseBody.scan) && Array.isArray(responseBody.scan.tiles)
        ? responseBody.scan.tiles
        : null;

  if (!tileValues) {
    return [];
  }

  return tileValues
    .map(parseTile)
    .filter((tile): tile is WorldScanTile => tile !== null);
}

export function formatWorldScanDetail(responseBody: unknown) {
  const [tile] = parseWorldScanTiles(responseBody);

  if (!tile) {
    return "World Scan\nNo scan tiles were returned.";
  }

  const lines = [
    "World Scan",
    `Tile: (${tile.x}, ${tile.y})`,
    `Distance: ${formatNumber(tile.distance)}`,
    `Terrain: ${tile.terrain}`,
    `Estimated Quantity: ${formatQuantityEstimateDetail(tile.quantityEstimate)}`,
    "Resources",
    "Resource | Confidence | Est. Qty",
  ];

  if (tile.resources.length === 0) {
    lines.push("None | 0% | 0");
    return lines.join("\n");
  }

  for (const resource of tile.resources) {
    lines.push(
      `${resource.displayName} | ${formatProbability(resource.probability, resource.probabilityIsPercent)} | ${resource.estimatedQuantity === null ? formatQuantityEstimateSummary(tile.quantityEstimate) : formatNumber(resource.estimatedQuantity)}`,
    );
  }

  return lines.join("\n");
}

export function formatWorldScanSummary(responseBody: unknown) {
  const tiles = parseWorldScanTiles(responseBody);

  if (tiles.length === 0) {
    return "World Scan Summary\nNo scan tiles were returned.";
  }

  const lines = [
    "World Scan Summary",
    [
      pad("Coordinates", 12),
      pad("Dist", 6),
      pad("Terrain", 16),
      pad("Top Candidate", 16),
      pad("Confidence", 12),
      "Est. Qty",
    ].join(" | "),
  ];

  for (const tile of tiles) {
    const topCandidate =
      tile.topCandidate ??
      [...tile.resources].sort((left, right) => right.probability - left.probability)[0] ??
      null;

    lines.push(
      [
        pad(`(${tile.x}, ${tile.y})`, 12),
        pad(formatNumber(tile.distance), 6),
        pad(tile.terrain, 16),
        pad(topCandidate?.displayName ?? "None", 16),
        pad(topCandidate ? formatProbability(topCandidate.probability, topCandidate.probabilityIsPercent) : "0%", 12),
        tile.quantityEstimate === null
          ? topCandidate?.estimatedQuantity === null || topCandidate?.estimatedQuantity === undefined
            ? "Unknown"
            : formatNumber(topCandidate.estimatedQuantity)
          : formatNumber(tile.quantityEstimate.estimatedKg),
      ].join(" | "),
    );
  }

  return lines.join("\n");
}
