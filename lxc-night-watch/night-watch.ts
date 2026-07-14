import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SOLAR_IRRADIANCE_URL = "https://planet.turingguild.com/world/solar-irradiance";
const OBSERVATIONS_HEADER = "# Observations\n";
const INCIDENTS_HEADER = "# Incidents\n";
const NORMAL_THRESHOLD = 450;

export type Classification = "NORMAL" | "INCIDENT" | "RECOVERED";

export type SolarReading = {
  wPerM2: number;
  condition: string;
};

type Observation = {
  timestamp: string;
  wPerM2: number;
  condition: string;
  classification: Classification;
  note: string;
};

type IncidentRecord = {
  startedAt: string;
  latestAt: string;
  latestWPerM2: number;
  latestCondition: string;
  lowestWPerM2: number;
  status: "open" | "recovered";
  recoveredAt: string | null;
};

type InspectionResult = {
  response: string;
  observation: Observation;
  incidents: IncidentRecord[];
};

type RunNightWatchInspectionOptions = {
  rootDir: string;
  timestamp?: string;
  fetchSolarIrradiance?: () => Promise<SolarReading>;
};

function formatReading(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatObservation(observation: Observation) {
  return `- ${observation.timestamp} | ${formatReading(observation.wPerM2)} W/m^2 | ${observation.condition} | ${observation.classification} | ${observation.note}`;
}

function buildObservationsMarkdown(observations: Observation[]) {
  if (observations.length === 0) {
    return OBSERVATIONS_HEADER;
  }

  return `${OBSERVATIONS_HEADER}${observations.map(formatObservation).join("\n")}\n`;
}

function formatIncident(incident: IncidentRecord) {
  const recovery = incident.status === "recovered" && incident.recoveredAt ? incident.recoveredAt : "pending";

  return [
    `## Incident ${incident.startedAt}`,
    `- Start: ${incident.startedAt}`,
    `- Latest Reading: ${formatReading(incident.latestWPerM2)} W/m^2 (${incident.latestCondition}) at ${incident.latestAt}`,
    `- Lowest Reading: ${formatReading(incident.lowestWPerM2)} W/m^2`,
    `- Status: ${incident.status}`,
    `- Recovery: ${recovery}`,
  ].join("\n");
}

function buildIncidentsMarkdown(incidents: IncidentRecord[]) {
  if (incidents.length === 0) {
    return INCIDENTS_HEADER;
  }

  return `${INCIDENTS_HEADER}\n${incidents.map(formatIncident).join("\n\n")}\n`;
}

function parseMostRecentObservation(markdown: string) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  const lastLine = lines.at(-1);
  if (!lastLine) {
    return null;
  }

  const match = /^- (.+?) \| ([0-9]+(?:\.[0-9]+)?) W\/m\^2 \| (.+?) \| (NORMAL|INCIDENT|RECOVERED) \| (.+)$/.exec(lastLine);
  if (!match) {
    return null;
  }

  const [, timestamp, wPerM2Text, condition, classification, note] = match;
  return {
    timestamp,
    wPerM2: Number(wPerM2Text),
    condition,
    classification: classification as Classification,
    note,
  } satisfies Observation;
}

function parseIncidentSection(section: string) {
  const startedAt = /^## Incident (.+)$/m.exec(section)?.[1]?.trim();
  const latestMatch = /^- Latest Reading: ([0-9]+(?:\.[0-9]+)?) W\/m\^2 \((.+)\) at (.+)$/m.exec(section);
  const lowestText = /^- Lowest Reading: ([0-9]+(?:\.[0-9]+)?) W\/m\^2$/m.exec(section)?.[1];
  const status = /^- Status: (open|recovered)$/m.exec(section)?.[1] as IncidentRecord["status"] | undefined;
  const recovery = /^- Recovery: (.+)$/m.exec(section)?.[1]?.trim();

  if (!startedAt || !latestMatch || !lowestText || !status) {
    return null;
  }

  return {
    startedAt,
    latestWPerM2: Number(latestMatch[1]),
    latestCondition: latestMatch[2],
    latestAt: latestMatch[3],
    lowestWPerM2: Number(lowestText),
    status,
    recoveredAt: recovery && recovery !== "pending" ? recovery : null,
  } satisfies IncidentRecord;
}

function parseIncidents(markdown: string) {
  const sections = markdown
    .split(/^## /m)
    .map((section, index) => (index === 0 ? section : `## ${section}`))
    .filter((section) => section.startsWith("## Incident "));

  return sections
    .map(parseIncidentSection)
    .filter((incident): incident is IncidentRecord => incident !== null);
}

function parseObservations(markdown: string) {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));

  return lines
    .map((line) => {
      const match =
        /^- (.+?) \| ([0-9]+(?:\.[0-9]+)?) W\/m\^2 \| (.+?) \| (NORMAL|INCIDENT|RECOVERED) \| (.+)$/.exec(line);

      if (!match) {
        return null;
      }

      const [, timestamp, wPerM2Text, condition, classification, note] = match;
      return {
        timestamp,
        wPerM2: Number(wPerM2Text),
        condition,
        classification: classification as Classification,
        note,
      } satisfies Observation;
    })
    .filter((observation): observation is Observation => observation !== null);
}

async function readMarkdownFile(path: string, fallback: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

function decideInspection(
  reading: SolarReading,
  timestamp: string,
  observationsMarkdown: string,
  incidentsMarkdown: string,
): InspectionResult {
  const observations = parseObservations(observationsMarkdown);
  const incidents = parseIncidents(incidentsMarkdown);
  const lastObservation = observations.at(-1) ?? null;
  const openIncidentIndex = incidents.findLastIndex((incident) => incident.status === "open");
  const openIncident = openIncidentIndex >= 0 ? incidents[openIncidentIndex] : null;

  if (reading.wPerM2 < NORMAL_THRESHOLD) {
    const observation: Observation = {
      timestamp,
      wPerM2: reading.wPerM2,
      condition: reading.condition,
      classification: "INCIDENT",
      note:
        lastObservation?.classification === "INCIDENT" && openIncident
          ? "Low-sunlight incident is still active."
          : "Solar irradiance fell below 450 W/m^2.",
    };

    if (openIncident) {
      const updatedIncidents = incidents.map((incident, index) =>
        index === openIncidentIndex
          ? {
              ...incident,
              latestAt: timestamp,
              latestWPerM2: reading.wPerM2,
              latestCondition: reading.condition,
              lowestWPerM2: Math.min(incident.lowestWPerM2, reading.wPerM2),
            }
          : incident,
      );

      return {
        response: "NO_REPLY",
        observation,
        incidents: updatedIncidents,
      };
    }

    return {
      response: `Solar incident at ${timestamp}: ${formatReading(reading.wPerM2)} W/m^2.`,
      observation,
      incidents: [
        ...incidents,
        {
          startedAt: timestamp,
          latestAt: timestamp,
          latestWPerM2: reading.wPerM2,
          latestCondition: reading.condition,
          lowestWPerM2: reading.wPerM2,
          status: "open",
          recoveredAt: null,
        },
      ],
    };
  }

  if (openIncident) {
    const observation: Observation = {
      timestamp,
      wPerM2: reading.wPerM2,
      condition: reading.condition,
      classification: "RECOVERED",
      note: "Solar irradiance recovered to normal levels.",
    };

    const updatedIncidents = incidents.map((incident, index) =>
      index === openIncidentIndex
        ? {
            ...incident,
            latestAt: timestamp,
            latestWPerM2: reading.wPerM2,
            latestCondition: reading.condition,
            status: "recovered" as const,
            recoveredAt: timestamp,
          }
        : incident,
    );

    return {
      response: `Solar recovered at ${timestamp}: ${formatReading(reading.wPerM2)} W/m^2.`,
      observation,
      incidents: updatedIncidents,
    };
  }

  return {
    response: "NO_REPLY",
    observation: {
      timestamp,
      wPerM2: reading.wPerM2,
      condition: reading.condition,
      classification: "NORMAL",
      note: "Normal sunlight with no open incident.",
    },
    incidents,
  };
}

async function fetchSolarIrradianceFromKepler() {
  const response = await fetch(SOLAR_IRRADIANCE_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Solar irradiance request failed with status ${response.status}.`);
  }

  const responseBody = (await response.json()) as unknown;
  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    typeof (responseBody as { solarIrradiance?: unknown }).solarIrradiance !== "object" ||
    (responseBody as { solarIrradiance?: unknown }).solarIrradiance === null
  ) {
    throw new Error("Solar irradiance response did not include a solarIrradiance object.");
  }

  const solarIrradiance = (responseBody as { solarIrradiance: Record<string, unknown> }).solarIrradiance;
  const wPerM2 = solarIrradiance.wPerM2;
  const condition = solarIrradiance.condition;

  if (typeof wPerM2 !== "number" || !Number.isFinite(wPerM2)) {
    throw new Error("Solar irradiance response did not include a numeric wPerM2 value.");
  }

  if (typeof condition !== "string" || condition.length === 0) {
    throw new Error("Solar irradiance response did not include a condition string.");
  }

  return {
    wPerM2,
    condition,
  } satisfies SolarReading;
}

export async function runNightWatchInspection(options: RunNightWatchInspectionOptions) {
  const observationsPath = join(options.rootDir, "observations.md");
  const incidentsPath = join(options.rootDir, "incidents.md");
  const timestamp = options.timestamp ?? new Date().toISOString();
  const fetchSolarIrradiance = options.fetchSolarIrradiance ?? fetchSolarIrradianceFromKepler;

  await mkdir(options.rootDir, { recursive: true });

  const [observationsMarkdown, incidentsMarkdown, reading] = await Promise.all([
    readMarkdownFile(observationsPath, OBSERVATIONS_HEADER),
    readMarkdownFile(incidentsPath, INCIDENTS_HEADER),
    fetchSolarIrradiance(),
  ]);

  const inspection = decideInspection(reading, timestamp, observationsMarkdown, incidentsMarkdown);
  const observations = [...parseObservations(observationsMarkdown), inspection.observation];

  await Promise.all([
    writeFile(observationsPath, buildObservationsMarkdown(observations)),
    writeFile(incidentsPath, buildIncidentsMarkdown(inspection.incidents)),
  ]);

  return {
    response: inspection.response,
    observation: inspection.observation,
  };
}
