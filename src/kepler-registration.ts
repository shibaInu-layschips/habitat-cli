import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

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

const registrationFilePath = join(process.cwd(), ".habitat", "registration.json");

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
  await mkdir(dirname(registrationFilePath), { recursive: true });
}

async function writeRegistration(registration: KeplerRegistration) {
  await ensureRegistrationDir();
  await writeFile(registrationFilePath, `${JSON.stringify(registration, null, 2)}\n`, "utf8");
}

export async function readRegistration(): Promise<KeplerRegistration | null> {
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

  let response: Response;
  try {
    response = await fetch(registerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${planetToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name }),
    });
  } catch (error) {
    throw new Error(`Unable to reach Kepler at ${registerUrl}: ${getErrorMessage(error)}`);
  }

  const responseBody = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      `Kepler registration failed (${response.status} ${response.statusText}). ${
        typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody)
      }`,
    );
  }

  const registration = normalizeRegistration(name, registerUrl, responseBody);
  await writeRegistration(registration);
  return registration;
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
  return registrationFilePath;
}
