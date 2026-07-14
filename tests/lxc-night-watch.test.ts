import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNightWatchInspection } from "../lxc-night-watch/night-watch";

describe("lxc night watch", () => {
  let workspaceDir = "";

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "lxc-night-watch-"));
  });

  afterEach(async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
    }
  });

  test("records a normal reading with no state change and returns NO_REPLY", async () => {
    const result = await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T08:00:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 520,
        condition: "clear",
      }),
    });

    expect(result.response).toBe("NO_REPLY");

    const observations = await readFile(join(workspaceDir, "observations.md"), "utf8");
    const incidents = await readFile(join(workspaceDir, "incidents.md"), "utf8");

    expect(observations).toContain(
      "- 2026-07-14T08:00:00Z | 520 W/m^2 | clear | NORMAL | Normal sunlight with no open incident.",
    );
    expect(incidents).toBe("# Incidents\n");
  });

  test("creates one incident on the first low-sunlight reading and returns an alert", async () => {
    const result = await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:00:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 430,
        condition: "dusty",
      }),
    });

    expect(result.response).toBe("Solar incident at 2026-07-14T09:00:00Z: 430 W/m^2.");

    const observations = await readFile(join(workspaceDir, "observations.md"), "utf8");
    const incidents = await readFile(join(workspaceDir, "incidents.md"), "utf8");

    expect(observations).toContain(
      "- 2026-07-14T09:00:00Z | 430 W/m^2 | dusty | INCIDENT | Solar irradiance fell below 450 W/m^2.",
    );
    expect(incidents).toContain("## Incident 2026-07-14T09:00:00Z");
    expect(incidents).toContain("- Start: 2026-07-14T09:00:00Z");
    expect(incidents).toContain("- Latest Reading: 430 W/m^2 (dusty) at 2026-07-14T09:00:00Z");
    expect(incidents).toContain("- Lowest Reading: 430 W/m^2");
    expect(incidents).toContain("- Status: open");
    expect(incidents).toContain("- Recovery: pending");
  });

  test("updates the same open incident during continued low sunlight and returns NO_REPLY", async () => {
    await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:00:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 430,
        condition: "dusty",
      }),
    });

    const result = await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:05:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 410,
        condition: "stormy",
      }),
    });

    expect(result.response).toBe("NO_REPLY");

    const observations = await readFile(join(workspaceDir, "observations.md"), "utf8");
    const incidents = await readFile(join(workspaceDir, "incidents.md"), "utf8");

    expect(observations).toContain(
      "- 2026-07-14T09:05:00Z | 410 W/m^2 | stormy | INCIDENT | Low-sunlight incident is still active.",
    );
    expect(incidents.match(/^## Incident /gm)).toHaveLength(1);
    expect(incidents).toContain("- Latest Reading: 410 W/m^2 (stormy) at 2026-07-14T09:05:00Z");
    expect(incidents).toContain("- Lowest Reading: 410 W/m^2");
    expect(incidents).toContain("- Status: open");
  });

  test("marks the incident recovered when irradiance returns to 450 or greater and returns a recovery message", async () => {
    await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:00:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 430,
        condition: "dusty",
      }),
    });

    const result = await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:15:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 470,
        condition: "clear",
      }),
    });

    expect(result.response).toBe("Solar recovered at 2026-07-14T09:15:00Z: 470 W/m^2.");

    const observations = await readFile(join(workspaceDir, "observations.md"), "utf8");
    const incidents = await readFile(join(workspaceDir, "incidents.md"), "utf8");

    expect(observations).toContain(
      "- 2026-07-14T09:15:00Z | 470 W/m^2 | clear | RECOVERED | Solar irradiance recovered to normal levels.",
    );
    expect(incidents).toContain("- Latest Reading: 470 W/m^2 (clear) at 2026-07-14T09:15:00Z");
    expect(incidents).toContain("- Status: recovered");
    expect(incidents).toContain("- Recovery: 2026-07-14T09:15:00Z");
  });

  test("returns to normal operation after recovery without sending another reply", async () => {
    await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:00:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 430,
        condition: "dusty",
      }),
    });

    await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:15:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 470,
        condition: "clear",
      }),
    });

    const result = await runNightWatchInspection({
      rootDir: workspaceDir,
      timestamp: "2026-07-14T09:30:00Z",
      fetchSolarIrradiance: async () => ({
        wPerM2: 500,
        condition: "clear",
      }),
    });

    expect(result.response).toBe("NO_REPLY");

    const observations = await readFile(join(workspaceDir, "observations.md"), "utf8");

    expect(observations).toContain(
      "- 2026-07-14T09:30:00Z | 500 W/m^2 | clear | NORMAL | Normal sunlight with no open incident.",
    );
  });
});
