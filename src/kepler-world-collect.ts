import { logKeplerRequest } from "./kepler-logging";

export type WorldCollectRequest = {
  habitatId: string;
  x: number;
  y: number;
  quantityKg: number;
};

function getConfig() {
  const baseUrl = process.env.KEPLER_BASE_URL?.trim();
  const planetToken = process.env.KEPLER_PLANET_TOKEN?.trim();

  if (!baseUrl) {
    throw new Error("Missing KEPLER_BASE_URL in .env.");
  }

  if (!planetToken) {
    throw new Error("Missing KEPLER_PLANET_TOKEN in .env.");
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), planetToken };
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

export async function collectWorldResource(request: WorldCollectRequest) {
  const { baseUrl, planetToken } = getConfig();
  const requestUrl = new URL("/world/collect", `${baseUrl}/`);

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${planetToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
  } catch (error) {
    logKeplerRequest("POST", "/world/collect", "network error");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach Kepler at ${requestUrl.toString()}: ${message}`);
  }

  const responseBody = await parseJsonResponse(response);
  logKeplerRequest("POST", "/world/collect", response.status);

  if (!response.ok) {
    const detail = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody);
    throw new Error(`Kepler world collection failed (${response.status} ${response.statusText}). ${detail}`);
  }

  return responseBody;
}
