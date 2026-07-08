import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hydrateModules, parseStarterModules, readModuleState } from "./module-storage";

export type KeplerRegistration = {
  habitatName: string;
  registeredAt: string;
  registrationId: string | null;
  habitatId: string | null;
  status: string;
  registerUrl: string;
  unregisterUrl: string | null;
  raw: unknown;
};

type KeplerConfig = {
  baseUrl: string;
  planetToken: string;
};

function getRegistrationFilePathValue() {
  return join(process.cwd(), ".habitat", "registration.json");
}

function getHabitatIdentityFilePathValue() {
  return join(process.cwd(), ".habitat", "identity.json");
}

function getHabitatIdentityBackupFilePathValue() {
  return join(process.cwd(), ".habitat", "identity.previous.json");
}

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

async function ensureRegistrationDir() {
  await mkdir(dirname(getRegistrationFilePathValue()), { recursive: true });
}

async function writeHabitatUuid(habitatUuid: string) {
  await ensureRegistrationDir();
  await writeFile(
    getHabitatIdentityFilePathValue(),
    `${JSON.stringify({ habitatUuid }, null, 2)}\n`,
    "utf8",
  );
}

async function backupHabitatIdentity() {
  const habitatIdentityFilePath = getHabitatIdentityFilePathValue();
  if (!existsSync(habitatIdentityFilePath)) {
    return;
  }

  const raw = await readFile(habitatIdentityFilePath, "utf8");
  await writeFile(getHabitatIdentityBackupFilePathValue(), raw, "utf8");
}

async function readOrCreateHabitatUuid() {
  await ensureRegistrationDir();
  const habitatIdentityFilePath = getHabitatIdentityFilePathValue();

  if (existsSync(habitatIdentityFilePath)) {
    const raw = await readFile(habitatIdentityFilePath, "utf8");
    const parsed = JSON.parse(raw) as { habitatUuid?: unknown };

    if (typeof parsed.habitatUuid === "string" && parsed.habitatUuid.length > 0) {
      return parsed.habitatUuid;
    }
  }

  const habitatUuid = crypto.randomUUID();
  await writeHabitatUuid(habitatUuid);
  return habitatUuid;
}

async function replaceHabitatUuid() {
  await backupHabitatIdentity();
  const habitatUuid = crypto.randomUUID();
  await writeHabitatUuid(habitatUuid);
  return habitatUuid;
}

async function writeRegistration(registration: KeplerRegistration) {
  await ensureRegistrationDir();
  await writeFile(getRegistrationFilePathValue(), `${JSON.stringify(registration, null, 2)}\n`, "utf8");
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
  const registrationFilePath = getRegistrationFilePathValue();
  if (!existsSync(registrationFilePath)) {
    return null;
  }

  const raw = await readFile(registrationFilePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<KeplerRegistration>;

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
    raw: parsed.raw ?? null,
  };
}

async function clearRegistration() {
  const registrationFilePath = getRegistrationFilePathValue();
  if (existsSync(registrationFilePath)) {
    await rm(registrationFilePath, { force: true });
  }
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
    throw new Error(`Unable to reach Kepler at ${registerUrl}: ${getErrorMessage(error)}`);
  }

  const responseBody = await parseJsonResponse(response);

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
    await writeRegistration(registration);
    await hydrateModules(registration.habitatId, parseStarterModules(registration.raw));
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
    await writeRegistration(registration);
    await hydrateModules(registration.habitatId, parseStarterModules(registration.raw));
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

      if (response.ok || response.status === 404) {
        await clearRegistration();
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
  return getRegistrationFilePathValue();
}
