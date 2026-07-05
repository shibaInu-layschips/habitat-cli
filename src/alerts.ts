import { readData, writeData } from "./store";

export type Alert = {
  name: string;
  text: string;
  level: string;
  status: string;
};

export async function createAlert(alert: Alert) {
  const data = await readData();

  if (data.alerts.some((existingAlert) => existingAlert.name === alert.name)) {
    throw new Error(`An alert named "${alert.name}" already exists.`);
  }

  data.alerts.push(alert);
  await writeData(data);

  return alert;
}

export async function listAlerts() {
  const data = await readData();
  return data.alerts;
}

export async function getAlert(name: string) {
  const data = await readData();
  return data.alerts.find((alert) => alert.name === name) ?? null;
}

export async function updateAlert(
  name: string,
  updates: Partial<Pick<Alert, "text" | "level" | "status">>,
) {
  const data = await readData();
  const alert = data.alerts.find((existingAlert) => existingAlert.name === name);

  if (!alert) {
    return null;
  }

  if (typeof updates.text === "string") {
    alert.text = updates.text;
  }

  if (typeof updates.level === "string") {
    alert.level = updates.level;
  }

  if (typeof updates.status === "string") {
    alert.status = updates.status;
  }

  await writeData(data);

  return alert;
}

export async function deleteAlert(name: string) {
  const data = await readData();
  const nextAlerts = data.alerts.filter((alert) => alert.name !== name);

  if (nextAlerts.length === data.alerts.length) {
    return false;
  }

  data.alerts = nextAlerts;
  await writeData(data);

  return true;
}

export async function sendAlert(name: string) {
  const data = await readData();
  const alert = data.alerts.find((existingAlert) => existingAlert.name === name);

  if (!alert) {
    return null;
  }

  alert.status = "sent";
  await writeData(data);

  return alert;
}
