import type { KeplerBlueprint } from "./kepler-blueprints";
import type { KeplerResource } from "./kepler-resources";
import type { SolarIrradianceReading } from "./kepler-irradiance";
import type { HabitatHuman, HabitatModule, HabitatModuleState, InventoryState, InventoryItem } from "./types";
import type { ClockState } from "./clock-state";
import type { KeplerStreamMetadata } from "./kepler-registration";
import type { ClockWatchNotice } from "./kepler-stream";

export type HabitatApiConfig = {
  baseUrl: string;
};

export type HabitatApiErrorBody = unknown;

export type HabitatRegistrationResponse = {
  registration: {
    habitatUuid: string | null;
    habitatId: string | null;
    displayName: string;
    apiToken: string | null;
    streamUrl: string | null;
    stream: KeplerStreamMetadata | null;
  } | null;
};

export type HabitatStatusRegistration = {
  habitatUuid: string | null;
  habitatId: string | null;
  displayName: string;
  registeredAt: string;
  status: string;
  registrationId: string | null;
  streamUrl: string | null;
  apiToken: string | null;
  stream: KeplerStreamMetadata | null;
};

export type HabitatStatusResponse = {
  currentTick: number;
  moduleCount: number;
  registration: HabitatStatusRegistration | null;
};

export type HabitatUnregisterResponse = {
  removed: boolean;
  registration: HabitatStatusRegistration | null;
};

export type HabitatBlueprintListResponse = {
  blueprints: KeplerBlueprint[];
};

export type HabitatBlueprintResponse = {
  blueprint: KeplerBlueprint;
};

export type HabitatResourceListResponse = {
  resources: KeplerResource[];
};

export type HabitatSolarIrradianceResponse = {
  solarIrradiance: SolarIrradianceReading | null;
};

export type HabitatModuleStateResponse = HabitatModuleState;

export type HabitatModuleResponse = {
  module: HabitatModule | null;
};

export type HabitatModuleMutationResponse = HabitatModuleResponse;

export type HabitatModuleDeleteResponse = {
  deleted: boolean;
};

export type HabitatHumanStateResponse = {
  habitatId: string | null;
  humans: HabitatHuman[];
};

export type HabitatInventoryStateResponse = InventoryState;

export type HabitatInventoryMutationResponse = {
  item: InventoryItem | null;
  removed: boolean;
};

export type HabitatClockResponse = { clock: ClockState };
export type HabitatClockStatusResponse = {
  clock: ClockState;
  mode: "manual" | "kepler";
  listening: boolean;
  manualTicksAllowed: boolean;
};

export async function getHabitatApiEventStream(pathname: string) {
  const baseUrl = process.env.HABITAT_API_BASE_URL?.trim() || "http://localhost:8787";
  return fetch(new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`), { headers: { Accept: "text/event-stream" } });
}
export type HabitatClockWatchResponse = { notices: ClockWatchNotice[] };

type HabitatApiRequestInit = Omit<RequestInit, "body" | "headers" | "method"> & {
  method?: string;
  headers?: HeadersInit;
  body?: unknown;
};

export class HabitatApiError extends Error {
  status: number;
  statusText: string;
  responseBody: HabitatApiErrorBody;

  constructor(status: number, statusText: string, responseBody: HabitatApiErrorBody) {
    super(formatHabitatApiErrorMessage(status, statusText, responseBody));
    this.name = "HabitatApiError";
    this.status = status;
    this.statusText = statusText;
    this.responseBody = responseBody;
  }
}

export function getHabitatApiBaseUrl() {
  const baseUrl = process.env.HABITAT_API_BASE_URL?.trim();

  if (!baseUrl) {
    return "http://localhost:8787";
  }

  return baseUrl.replace(/\/+$/, "");
}

export function getHabitatApiConfig(): HabitatApiConfig {
  return {
    baseUrl: getHabitatApiBaseUrl(),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatResponseDetail(responseBody: unknown) {
  if (typeof responseBody === "string") {
    return responseBody;
  }

  if (!responseBody) {
    return "No response body.";
  }

  if (isObject(responseBody)) {
    if (typeof responseBody.error === "string" && responseBody.error.length > 0) {
      return responseBody.error;
    }

    if (isObject(responseBody.error) && typeof responseBody.error.message === "string") {
      return responseBody.error.message;
    }

    if (typeof responseBody.message === "string" && responseBody.message.length > 0) {
      return responseBody.message;
    }
  }

  return JSON.stringify(responseBody);
}

function formatHabitatApiErrorMessage(status: number, statusText: string, responseBody: unknown) {
  return `Habitat API request failed (${status} ${statusText}). ${formatResponseDetail(responseBody)}`;
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

function buildRequestUrl(baseUrl: string, pathname: string) {
  return new URL(pathname, `${baseUrl}/`).toString();
}

export async function requestHabitatApiJson<TResponse>(
  pathname: string,
  init: HabitatApiRequestInit = {},
): Promise<TResponse> {
  const { baseUrl } = getHabitatApiConfig();
  const requestUrl = buildRequestUrl(baseUrl, pathname);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  let body: BodyInit | null | undefined = init.body as BodyInit | null | undefined;
  if (init.body !== undefined && !(init.body instanceof FormData) && !(init.body instanceof Blob) && typeof init.body !== "string") {
    body = JSON.stringify(init.body);
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...init,
      headers,
      body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to reach Habitat API at ${requestUrl}: ${message}`);
  }

  const responseBody = await parseJsonResponse(response);

  if (!response.ok) {
    throw new HabitatApiError(response.status, response.statusText, responseBody);
  }

  return responseBody as TResponse;
}

export async function getHabitatApiJson<TResponse>(pathname: string) {
  return await requestHabitatApiJson<TResponse>(pathname, { method: "GET" });
}

export async function postHabitatApiJson<TResponse>(pathname: string, body: unknown) {
  return await requestHabitatApiJson<TResponse>(pathname, { method: "POST", body });
}

export async function putHabitatApiJson<TResponse>(pathname: string, body: unknown) {
  return await requestHabitatApiJson<TResponse>(pathname, { method: "PUT", body });
}

export async function deleteHabitatApiJson<TResponse>(pathname: string) {
  return await requestHabitatApiJson<TResponse>(pathname, { method: "DELETE" });
}
