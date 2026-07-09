type KeplerConfig = {
  baseUrl: string;
  planetToken: string;
};

export class KeplerBlueprintNotFoundError extends Error {
  constructor(blueprintId: string) {
    super(`No Kepler blueprint with ID "${blueprintId}" was found.`);
    this.name = "KeplerBlueprintNotFoundError";
  }
}

export type KeplerRequiredFacility = {
  moduleType: string;
  minimumLevel: number;
};

export type KeplerBlueprint = {
  id: string;
  blueprintId: string;
  displayName: string;
  description: string;
  status: string;
  buildTicks: number;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
  requiredFacility: KeplerRequiredFacility | null;
  prerequisites: string[];
  capabilities: string[];
  runtimeAttributes: Record<string, unknown>;
};

function getConfig(): KeplerConfig {
  const baseUrl = process.env.KEPLER_BASE_URL?.trim();
  const planetToken = process.env.KEPLER_PLANET_TOKEN?.trim();

  if (!baseUrl) {
    throw new Error("Missing KEPLER_BASE_URL in .env.");
  }

  if (!planetToken) {
    throw new Error("Missing KEPLER_PLANET_TOKEN in .env.");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    planetToken,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asRecord(value: unknown) {
  return isObject(value) ? value : {};
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseRequiredFacility(value: unknown): KeplerRequiredFacility | null {
  if (!isObject(value)) {
    return null;
  }

  const moduleType = asString(value.moduleType);

  if (!moduleType) {
    return null;
  }

  return {
    moduleType,
    minimumLevel: asNumber(value.minimumLevel),
  };
}

function parseBlueprint(value: unknown): KeplerBlueprint | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asString(value.id);
  const blueprintId = asString(value.blueprintId);
  const displayName = asString(value.displayName);

  if (!id || !blueprintId || !displayName) {
    return null;
  }

  return {
    id,
    blueprintId,
    displayName,
    description: asString(value.description),
    status: asString(value.status),
    buildTicks: asNumber(value.buildTicks),
    inputs: asRecord(value.inputs),
    output: asRecord(value.output),
    requiredFacility: parseRequiredFacility(value.requiredFacility),
    prerequisites: asStringArray(value.prerequisites),
    capabilities: asStringArray(value.capabilities),
    runtimeAttributes: asRecord(value.runtimeAttributes),
  };
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function formatResponseError(status: number, statusText: string, responseBody: unknown) {
  const detail =
    typeof responseBody === "string" ? responseBody : responseBody ? JSON.stringify(responseBody) : "No response body.";
  return `Kepler blueprint request failed (${status} ${statusText}). ${detail}`;
}

function normalizeBlueprintQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseBlueprintCatalogResponse(responseBody: unknown) {
  if (!isObject(responseBody) || !Array.isArray(responseBody.blueprints)) {
    return null;
  }

  return responseBody.blueprints
    .map(parseBlueprint)
    .filter((blueprint): blueprint is KeplerBlueprint => blueprint !== null);
}

async function sendCatalogRequest(pathname: string) {
  const { baseUrl, planetToken } = getConfig();
  const requestUrl = new URL(pathname, `${baseUrl}/`).toString();

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${planetToken}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach Kepler at ${requestUrl}: ${message}`);
  }

  const responseBody = await parseJsonResponse(response);

  if (!response.ok) {
    if (response.status === 404) {
      return {
        notFound: true,
        responseBody,
      } as const;
    }

    throw new Error(formatResponseError(response.status, response.statusText, responseBody));
  }

  return responseBody;
}

export async function listBlueprintCatalog() {
  const responseBody = await sendCatalogRequest("/catalog/blueprints");

  const blueprints = parseBlueprintCatalogResponse(responseBody);

  if (!blueprints) {
    throw new Error("Kepler returned an invalid blueprint catalog response.");
  }

  return blueprints;
}

export async function showBlueprintCatalogEntry(blueprintId: string) {
  const responseBody = await sendCatalogRequest(`/catalog/blueprints/${encodeURIComponent(blueprintId)}`);

  if (isObject(responseBody) && responseBody.notFound === true) {
    const catalogResponse = await sendCatalogRequest("/catalog/blueprints");

    if (isObject(catalogResponse) && catalogResponse.notFound === true) {
      throw new KeplerBlueprintNotFoundError(blueprintId);
    }

    const blueprints = parseBlueprintCatalogResponse(catalogResponse);

    if (!blueprints) {
      throw new Error("Kepler returned an invalid blueprint catalog response.");
    }

    const normalizedQuery = normalizeBlueprintQuery(blueprintId);
    const matchedBlueprint =
      blueprints.find((blueprint) => normalizeBlueprintQuery(blueprint.blueprintId) === normalizedQuery) ??
      blueprints.find((blueprint) => normalizeBlueprintQuery(blueprint.displayName) === normalizedQuery) ??
      blueprints.find((blueprint) => normalizeBlueprintQuery(blueprint.id) === normalizedQuery) ??
      null;

    if (!matchedBlueprint) {
      throw new KeplerBlueprintNotFoundError(blueprintId);
    }

    return matchedBlueprint;
  }

  if (!isObject(responseBody) || !isObject(responseBody.blueprint)) {
    throw new Error("Kepler returned an invalid blueprint response.");
  }

  const blueprint = parseBlueprint(responseBody.blueprint);

  if (!blueprint) {
    throw new Error("Kepler returned an invalid blueprint entry.");
  }

  return blueprint;
}
