import { logKeplerRequest } from "./kepler-logging";

type KeplerConfig = {
  baseUrl: string;
  planetToken: string;
};

export type SolarIrradianceReading = {
  wPerM2: number;
  condition: string;
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

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function parseSolarIrradianceReading(responseBody: unknown): SolarIrradianceReading | null {
  if (!isObject(responseBody) || !isObject(responseBody.solarIrradiance)) {
    return null;
  }

  const wPerM2 = asNumber(responseBody.solarIrradiance.wPerM2);
  const condition = asString(responseBody.solarIrradiance.condition);

  if (wPerM2 === null || !condition) {
    return null;
  }

  return {
    wPerM2,
    condition,
  };
}

async function sendWorldRequest(pathname: string) {
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
  } catch {
    logKeplerRequest("GET", pathname, "network error");
    return null;
  }

  logKeplerRequest("GET", pathname, response.status);
  if (!response.ok) {
    return null;
  }

  return parseJsonResponse(response);
}

export async function readSolarIrradianceReading() {
  const responseBody = await sendWorldRequest("/world/solar-irradiance");

  if (!responseBody) {
    return null;
  }

  return parseSolarIrradianceReading(responseBody);
}
