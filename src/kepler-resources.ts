type KeplerConfig = {
  baseUrl: string;
  planetToken: string;
};

export type KeplerResource = {
  id: string;
  resourceType: string;
  displayName: string;
  kind: string;
  rarity: string;
  unit: string;
  description: string;
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

function parseResource(value: unknown): KeplerResource | null {
  if (!isObject(value)) {
    return null;
  }

  const id = asString(value.id);
  const resourceType = asString(value.resourceType);
  const displayName = asString(value.displayName);

  if (!id || !resourceType || !displayName) {
    return null;
  }

  return {
    id,
    resourceType,
    displayName,
    kind: asString(value.kind),
    rarity: asString(value.rarity),
    unit: asString(value.unit),
    description: asString(value.description),
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
  return `Kepler resource request failed (${status} ${statusText}). ${detail}`;
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
    throw new Error(formatResponseError(response.status, response.statusText, responseBody));
  }

  return responseBody;
}

export async function listResourceCatalog() {
  const responseBody = await sendCatalogRequest("/catalog/resources");

  if (!isObject(responseBody) || !Array.isArray(responseBody.resources)) {
    throw new Error("Kepler returned an invalid resource catalog response.");
  }

  return responseBody.resources
    .map(parseResource)
    .filter((resource): resource is KeplerResource => resource !== null);
}
