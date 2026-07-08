import { describe, expect, test } from "bun:test";
import { formatModuleStatusReport } from "../src/module-status";
import type { HabitatModule } from "../src/types";

const commandModule: HabitatModule = {
  id: "module-command",
  slug: "command-module-1",
  blueprintId: "command-module",
  displayName: "Command Module",
  connectedTo: [],
  runtimeAttributes: {
    status: "active",
    powerDrawKw: {
      offline: 0,
      idle: 1.5,
      active: 2.25,
      damaged: 3.5,
    },
  },
  capabilities: [],
};

const lifeSupportModule: HabitatModule = {
  id: "module-life-support",
  slug: "life-support-1",
  blueprintId: "life-support",
  displayName: "Life Support",
  connectedTo: [],
  runtimeAttributes: {
    status: "damaged",
    powerDrawKw: {
      offline: 0,
      idle: 4,
      active: 5,
      damaged: 7,
    },
  },
  capabilities: [],
};

const unknownStateModule: HabitatModule = {
  id: "module-greenhouse",
  slug: "greenhouse-1",
  blueprintId: "greenhouse",
  displayName: "Greenhouse",
  connectedTo: [],
  runtimeAttributes: {
    status: "overclocked",
    powerDrawKw: {
      offline: 0,
      idle: 3,
      active: 4,
    },
  },
  capabilities: [],
};

describe("module status report", () => {
  test("maps each module state to the matching draw value", () => {
    const report = formatModuleStatusReport([
      commandModule,
      lifeSupportModule,
      unknownStateModule,
    ]);

    expect(report).toContain("Command Module");
    expect(report).toContain("active");
    expect(report).toContain("2.25");
    expect(report).toContain("Life Support");
    expect(report).toContain("damaged");
    expect(report).toContain("7");
    expect(report).toContain("Greenhouse");
    expect(report).toContain("overclocked");
    expect(report).toContain("3");
  });

  test("adds a summary line with total draw and per-tick energy cost", () => {
    const report = formatModuleStatusReport([
      commandModule,
      lifeSupportModule,
      unknownStateModule,
    ]);

    expect(report).toContain("Total Power Draw: 12.25 kW");
    expect(report).toContain("Tick Energy Cost: 0.003403 kWh");
  });
});
