import { readRegistration } from "./kepler-registration";
import { readStateBlob, writeStateBlob } from "./sqlite-storage";
import type { HabitatAlert, HabitatAlertState } from "./types";

const ALERTS_NAMESPACE = "alerts";

function readAlertStateBlob(): HabitatAlertState {
  const raw = readStateBlob(ALERTS_NAMESPACE);
  if (!raw) return { alerts: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<HabitatAlertState>;
    return { alerts: Array.isArray(parsed.alerts) ? parsed.alerts as HabitatAlert[] : [] };
  } catch {
    return { alerts: [] };
  }
}

function writeAlertStateBlob(state: HabitatAlertState) {
  writeStateBlob(ALERTS_NAMESPACE, `${JSON.stringify(state, null, 2)}\n`);
}

export async function listAlerts() {
  return readAlertStateBlob().alerts;
}

export async function observeAlert(input: {
  conditionKey: string;
  severity: string;
  source: string;
  message: string;
  subject?: HabitatAlert["subject"];
}) {
  const registration = await readRegistration();
  if (!registration) return null;
  const schemaVersion = registration?.alertContract?.schemaVersion;
  if (!schemaVersion) return null;

  const now = new Date().toISOString();
  const state = readAlertStateBlob();
  const existing = state.alerts.find((alert) => alert.conditionKey === input.conditionKey && alert.status !== "resolved");
  if (existing) {
    existing.lastObservedAt = now;
    existing.occurrenceCount += 1;
    existing.message = input.message;
    existing.subject = input.subject;
    writeAlertStateBlob(state);
    return existing;
  }

  const alert: HabitatAlert = {
    id: crypto.randomUUID(),
    conditionKey: input.conditionKey,
    severity: input.severity,
    status: "open",
    source: input.source,
    message: input.message,
    createdAt: now,
    lastObservedAt: now,
    occurrenceCount: 1,
    ...(input.subject ? { subject: input.subject } : {}),
    contractSchemaVersion: schemaVersion,
  };
  state.alerts.push(alert);
  writeAlertStateBlob(state);
  return alert;
}

export async function resolveAlert(conditionKey: string) {
  const state = readAlertStateBlob();
  const alert = state.alerts.find((candidate) => candidate.conditionKey === conditionKey && candidate.status !== "resolved");
  if (!alert) return null;
  alert.status = "resolved";
  alert.resolvedAt = new Date().toISOString();
  writeAlertStateBlob(state);
  return alert;
}

export async function acknowledgeAlert(alertId: string) {
  const state = readAlertStateBlob();
  const alert = state.alerts.find((candidate) => candidate.id === alertId);
  if (!alert) throw new Error(`No alert with ID "${alertId}" was found.`);
  if (alert.status === "resolved") throw new Error(`Alert "${alertId}" is already resolved.`);
  alert.status = "acknowledged";
  alert.acknowledgedAt = new Date().toISOString();
  writeAlertStateBlob(state);
  return alert;
}
