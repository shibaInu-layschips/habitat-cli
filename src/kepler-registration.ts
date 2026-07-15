import { hydrateHumans } from "./human-storage";
import { hydrateModules, parseStarterModules, readModuleState } from "./module-storage";
import { logKeplerRequest } from "./kepler-logging";
import { deleteStateBlob, getSqliteDatabaseFilePath, readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { AlertContract, HabitatHuman } from "./types";
import { resetEvaState } from "./eva-state";

export type KeplerRegistration = {
  habitatName: string;
  registeredAt: string;
  registrationId: string | null;
  habitatId: string | null;
  status: string;
  registerUrl: string;
  unregisterUrl: string | null;
  starterHumans: HabitatHuman[];
  alertContract: AlertContract | null;
  raw: unknown;
};

type KeplerConfig = {
  baseUrl: string;
  planetToken: string;
};

const REGISTRATION_STATE_NAMESPACE = "registration";
const IDENTITY_STATE_NAMESPACE = "identity";

class KeplerRequestError extends Error {
  status: number;
  statusText: string;
  responseBody: unknown;

  constructor(status: number, statusText: string, responseBody: unknown) {
    super(
      `Kepler registration failed (${status} ${statusText}). ${
        typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)
      }`,
    );
    this.name = "KeplerRequestError";
    this.status = status;
    this.statusText = statusText;
    this.responseBody = responseBody;
  }
}

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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  return isObject(value) ? value : null;
}

function findFirstString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const found = asString(value[key]);
    if (found) {
      return found;
    }
  }

  return null;
}

function buildRegisterUrl(baseUrl: string) {
  return new URL("/habitats/register", `${baseUrl}/`).toString();
}

function buildFallbackUnregisterUrls(baseUrl: string, registration: KeplerRegistration) {
  const urls: string[] = [];

  if (registration.unregisterUrl) {
    urls.push(registration.unregisterUrl);
  }

  if (registration.registrationId) {
    urls.push(new URL(`/habitats/register/${registration.registrationId}`, `${baseUrl}/`).toString());
    urls.push(new URL(`/registrations/${registration.registrationId}`, `${baseUrl}/`).toString());
  }

  if (registration.habitatId) {
    urls.push(new URL(`/habitats/${registration.habitatId}`, `${baseUrl}/`).toString());
  }

  return [...new Set(urls)];
}

type HabitatIdentityState = {
  habitatUuid: string;
  previousHabitatUuid: string | null;
};

function readHabitatIdentityState(): HabitatIdentityState | null {
  const raw = readStateBlob(IDENTITY_STATE_NAMESPACE);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<HabitatIdentityState>;

    if (typeof parsed.habitatUuid !== "string" || parsed.habitatUuid.length === 0) {
      return null;
    }

    return {
      habitatUuid: parsed.habitatUuid,
      previousHabitatUuid:
        typeof parsed.previousHabitatUuid === "string" && parsed.previousHabitatUuid.length > 0
          ? parsed.previousHabitatUuid
          : null,
    };
  } catch {
    return null;
  }
}

export function readHabitatUuid() {
  return readHabitatIdentityState()?.habitatUuid ?? null;
}

function parseStarterHuman(value: unknown): HabitatHuman | null {
  const record = asObjectRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const displayName = asString(record.displayName);
  const locationModuleId = asString(record.locationModuleId);

  if (!id || !displayName || !locationModuleId) {
    return null;
  }

  return {
    id,
    displayName,
    locationModuleId,
  };
}

export function parseStarterHumans(responseBody: unknown) {
  if (!isObject(responseBody) || !Array.isArray(responseBody.starterHumans)) {
    return [];
  }

  return responseBody.starterHumans
    .map(parseStarterHuman)
    .filter((human): human is HabitatHuman => human !== null);
}

function getStarterHumansCount(responseBody: unknown) {
  return isObject(responseBody) && Array.isArray(responseBody.starterHumans) ? responseBody.starterHumans.length : 0;
}

function getStarterModulesCount(responseBody: unknown) {
  return isObject(responseBody) && Array.isArray(responseBody.starterModules) ? responseBody.starterModules.length : 0;
}

export function parseAlertContract(responseBody: unknown): AlertContract | null {
  if (!isObject(responseBody) || !isObject(responseBody.contracts) || !isObject(responseBody.contracts.alerts)) {
    return null;
  }

  const schemaVersion = asString(responseBody.contracts.alerts.schemaVersion);
  const schema = asObjectRecord(responseBody.contracts.alerts.schema);

  if (!schemaVersion || !schema) {
    return null;
  }

  return {
    schemaVersion,
    schema,
  };
}

function writeHabitatIdentityState(state: HabitatIdentityState) {
  writeStateBlob(IDENTITY_STATE_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

function readOrCreateHabitatUuid() {
  const existing = readHabitatIdentityState();
  if (existing) {
    return existing.habitatUuid;
  }

  const habitatUuid = crypto.randomUUID();
  writeHabitatIdentityState({ habitatUuid, previousHabitatUuid: null });
  return habitatUuid;
}

function replaceHabitatUuid() {
  const existing = readHabitatIdentityState();
  const habitatUuid = crypto.randomUUID();

  writeHabitatIdentityState({
    habitatUuid,
    previousHabitatUuid: existing?.habitatUuid ?? null,
  });

  return habitatUuid;
}

function writeRegistration(registration: KeplerRegistration) {
  writeStateBlob(REGISTRATION_STATE_NAMESPACE, `${JSON.stringify(registration, null, 2)}\n`);
}

export async function ensureLocalModulesFromRegistration(registration: KeplerRegistration | null) {
  if (!registration) {
    return;
  }

  const starterModules = parseStarterModules(registration.raw);
  if (starterModules.length === 0) {
    return;
  }

  const moduleState = await readModuleState();
  if (
    moduleState.habitatId === registration.habitatId &&
    moduleState.modules.length > 0
  ) {
    return;
  }

  await hydrateModules(registration.habitatId, starterModules);
}

export async function readRegistration(): Promise<KeplerRegistration | null> {
  const raw = readStateBlob(REGISTRATION_STATE_NAMESPACE);
  if (!raw) {
    return null;
  }

  let parsed: Partial<KeplerRegistration>;
  try {
    parsed = JSON.parse(raw) as Partial<KeplerRegistration>;
  } catch {
    return null;
  }

  if (
    typeof parsed.habitatName !== "string" ||
    typeof parsed.registeredAt !== "string" ||
    typeof parsed.status !== "string" ||
    typeof parsed.registerUrl !== "string"
  ) {
    return null;
  }

  return {
    habitatName: parsed.habitatName,
    registeredAt: parsed.registeredAt,
    registrationId: typeof parsed.registrationId === "string" ? parsed.registrationId : null,
    habitatId: typeof parsed.habitatId === "string" ? parsed.habitatId : null,
    status: parsed.status,
    registerUrl: parsed.registerUrl,
    unregisterUrl: typeof parsed.unregisterUrl === "string" ? parsed.unregisterUrl : null,
    starterHumans: Array.isArray(parsed.starterHumans) ? parsed.starterHumans.map(parseStarterHuman).filter((human): human is HabitatHuman => human !== null) : parseStarterHumans(parsed.raw ?? null),
    alertContract: parseAlertContract(parsed.alertContract ?? null) ?? parseAlertContract(parsed.raw ?? null),
    raw: parsed.raw ?? null,
  };
}

function clearRegistration() {
  deleteStateBlob(REGISTRATION_STATE_NAMESPACE);
  deleteStateBlob("alerts");
}

async function rollbackRegistrationPersistence() {
  clearRegistration();
  await hydrateModules(null, []);
  await hydrateHumans(null, []);
  await resetEvaState();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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

function isRecordWithError(responseBody: unknown): responseBody is { error: Record<string, unknown> } {
  if (!isObject(responseBody)) {
    return false;
  }

  const error = responseBody.error;
  return isObject(error);
}

function isRetryableIdentityFailure(error: unknown) {
  if (!(error instanceof KeplerRequestError)) {
    return false;
  }

  const responseBody = error.responseBody;

  if (error.status !== 500 || !isRecordWithError(responseBody)) {
    return false;
  }

  const serverError = responseBody.error;
  return (
    serverError.code === "validation_failed" &&
    serverError.message === "Unexpected server error."
  );
}

async function sendRegisterRequest(
  registerUrl: string,
  planetToken: string,
  habitatName: string,
  habitatUuid: string,
) {
  let response: Response;
  try {
    response = await fetch(registerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${planetToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ displayName: habitatName, habitatUuid }),
    });
  } catch (error) {
    logKeplerRequest("POST", "/habitats/register", "network error");
    throw new Error(`Unable to reach Kepler at ${registerUrl}: ${getErrorMessage(error)}`);
  }

  const responseBody = await parseJsonResponse(response);
  logKeplerRequest("POST", "/habitats/register", response.status);

  if (!response.ok) {
    throw new KeplerRequestError(response.status, response.statusText, responseBody);
  }

  return normalizeRegistration(habitatName, registerUrl, responseBody);
}

function normalizeRegistration(
  habitatName: string,
  registerUrl: string,
  responseBody: unknown,
): KeplerRegistration {
  const record = isObject(responseBody) ? responseBody : {};
  const nestedRegistration = isObject(record.registration) ? record.registration : null;
  const nestedHabitat = isObject(record.habitat) ? record.habitat : null;

  const registrationId =
    findFirstString(record, ["registrationId", "id"]) ??
    (nestedRegistration ? findFirstString(nestedRegistration, ["id", "registrationId"]) : null);

  const habitatId =
    findFirstString(record, ["habitatId"]) ??
    (nestedHabitat ? findFirstString(nestedHabitat, ["id", "habitatId"]) : null);

  const status =
    findFirstString(record, ["status"]) ??
    (nestedRegistration ? findFirstString(nestedRegistration, ["status"]) : null) ??
    "registered";

  const unregisterUrl =
    findFirstString(record, ["unregisterUrl", "deleteUrl"]) ??
    (nestedRegistration
      ? findFirstString(nestedRegistration, ["unregisterUrl", "deleteUrl"])
      : null);

  return {
    habitatName,
    registeredAt: new Date().toISOString(),
    registrationId,
    habitatId,
    status,
    registerUrl,
    unregisterUrl,
    starterHumans: parseStarterHumans(responseBody),
    alertContract: parseAlertContract(responseBody),
    raw: responseBody,
  };
}

export async function registerHabitat(name: string) {
  const existing = await readRegistration();

  if (existing) {
    throw new Error(
      `This CLI is already registered as "${existing.habitatName}". Run "habitat unregister" first if you want to replace it.`,
    );
  }

  const { baseUrl, planetToken } = getConfig();
  const registerUrl = buildRegisterUrl(baseUrl);
  try {
    const habitatUuid = await readOrCreateHabitatUuid();
    const registration = await sendRegisterRequest(registerUrl, planetToken, name, habitatUuid);
    const starterModules = parseStarterModules(registration.raw);
    const starterHumans = registration.starterHumans;
    const expectedStarterModuleCount = getStarterModulesCount(registration.raw);
    const expectedStarterHumanCount = getStarterHumansCount(registration.raw);

    if (starterModules.length !== expectedStarterModuleCount) {
      throw new Error("Could not persist all starter modules from the registration response.");
    }

    if (starterHumans.length !== expectedStarterHumanCount) {
      throw new Error("Could not persist all starter humans from the registration response.");
    }

    try {
      writeRegistration(registration);
      await hydrateModules(registration.habitatId, starterModules);
      await hydrateHumans(registration.habitatId, starterHumans);
    } catch (error) {
      await rollbackRegistrationPersistence();
      throw error;
    }

    return registration;
  } catch (error) {
    if (!isRetryableIdentityFailure(error)) {
      throw error;
    }
  }

  console.log(
    "Kepler rejected the saved habitat identity. Retrying once with a fresh local habitat identity...",
  );

  const freshHabitatUuid = await replaceHabitatUuid();

  try {
    const registration = await sendRegisterRequest(registerUrl, planetToken, name, freshHabitatUuid);
    const starterModules = parseStarterModules(registration.raw);
    const starterHumans = registration.starterHumans;
    const expectedStarterModuleCount = getStarterModulesCount(registration.raw);
    const expectedStarterHumanCount = getStarterHumansCount(registration.raw);

    if (starterModules.length !== expectedStarterModuleCount) {
      throw new Error("Could not persist all starter modules from the registration response.");
    }

    if (starterHumans.length !== expectedStarterHumanCount) {
      throw new Error("Could not persist all starter humans from the registration response.");
    }

    try {
      writeRegistration(registration);
      await hydrateModules(registration.habitatId, starterModules);
      await hydrateHumans(registration.habitatId, starterHumans);
    } catch (error) {
      await rollbackRegistrationPersistence();
      throw error;
    }

    return registration;
  } catch (error) {
    throw new Error(
      `${getErrorMessage(error)} Tried again with a fresh local habitat identity and Kepler still failed.`,
    );
  }
}

export async function unregisterHabitat() {
  const registration = await readRegistration();

  if (!registration) {
    return false;
  }

  const { baseUrl, planetToken } = getConfig();
  const candidateUrls = buildFallbackUnregisterUrls(baseUrl, registration);

  if (candidateUrls.length === 0) {
    throw new Error(
      "No Kepler unregister URL or registration ID was saved locally, so this registration cannot be removed automatically.",
    );
  }

  const errors: string[] = [];

  for (const unregisterUrl of candidateUrls) {
    try {
      const response = await fetch(unregisterUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${planetToken}`,
          Accept: "application/json",
        },
      });
      logKeplerRequest("DELETE", new URL(unregisterUrl).pathname, response.status);

      if (response.ok || response.status === 404) {
        await clearRegistration();
        await hydrateModules(null, []);
        await hydrateHumans(null, []);
        await resetEvaState();
        return true;
      }

      const responseBody = await parseJsonResponse(response);
      errors.push(
        `${unregisterUrl} -> ${response.status} ${response.statusText}${
          responseBody ? `: ${typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)}` : ""
        }`,
      );
    } catch (error) {
      errors.push(`${unregisterUrl} -> ${getErrorMessage(error)}`);
    }
  }

  throw new Error(`Kepler unregister failed. ${errors.join(" | ")}`);
}

export function getRegistrationFilePath() {
  return getSqliteDatabaseFilePath();
}
