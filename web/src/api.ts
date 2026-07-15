import type {
  RegistrationResponse,
  SolarResponse,
  StateResponse,
  StatusResponse,
  TickResponse,
} from "./types";

const apiBaseUrl = (import.meta.env.VITE_HABITAT_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

async function requestJson<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await response.text();
    const body = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      const message =
        typeof record?.error === "string"
          ? record.error
          : `Request failed (${response.status} ${response.statusText})`;
      throw new Error(message);
    }

    return body as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function loadDashboardData() {
  const [status, state, solar] = await Promise.all([
    requestJson<StatusResponse>("/status"),
    requestJson<StateResponse>("/state"),
    requestJson<SolarResponse>("/solar/irradiance").catch(() => ({ solarIrradiance: null })),
  ]);

  return { status, state, solar };
}

export async function registerHabitat(displayName: string) {
  return await requestJson<RegistrationResponse>("/registration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
}

export async function unregisterHabitat() {
  return await requestJson<{ removed: boolean; registration: null }>("/registration", {
    method: "DELETE",
  });
}

export async function setModuleStatus(moduleId: string, status: "online" | "offline") {
  return await requestJson<{ module: unknown }>(`/modules/${encodeURIComponent(moduleId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function advanceTicks(ticks: number, signal?: AbortSignal) {
  return await requestJson<TickResponse>("/simulation/ticks", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticks }),
  }, 30 * 60 * 1000);
}
