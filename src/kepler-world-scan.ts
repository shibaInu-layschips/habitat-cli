import { logKeplerRequest } from "./kepler-logging";

type KeplerConfig = {
  baseUrl: string;
  planetToken: string;
};

export type WorldScanRequest = {
  habitatId: string;
  x: number;
  y: number;
  sensorStrength: number;
  radius: number;
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
  return `Kepler world scan request failed (${status} ${statusText}). ${detail}`;
}

export async function readWorldScan(request: WorldScanRequest) {
  const { baseUrl, planetToken } = getConfig();
  const requestUrl = new URL("/world/scan", `${baseUrl}/`);
  requestUrl.searchParams.set("habitatId", request.habitatId);
  requestUrl.searchParams.set("x", String(request.x));
  requestUrl.searchParams.set("y", String(request.y));
  requestUrl.searchParams.set("sensorStrength", String(request.sensorStrength));
  requestUrl.searchParams.set("radiusTiles", String(request.radius));

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
    logKeplerRequest("GET", "/world/scan", "network error");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach Kepler at ${requestUrl.toString()}: ${message}`);
  }

  const responseBody = await parseJsonResponse(response);
  logKeplerRequest("GET", "/world/scan", response.status);

  if (!response.ok) {
    throw new Error(formatResponseError(response.status, response.statusText, responseBody));
  }

  return responseBody;
}
