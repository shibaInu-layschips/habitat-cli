import type { ConstructionJob } from "./types";

function padCell(value: string, width: number) {
  return value.padEnd(width, " ");
}

export function formatConstructionStatus(jobs: ConstructionJob[]) {
  const rows = jobs.map((job) => ({
    jobId: job.id,
    blueprintId: job.blueprintId,
    output: job.outputModuleType,
    facility: job.facilityModuleSlug,
    status: job.status,
    ticksLeft: String(job.remainingBuildTicks),
    spentResources: JSON.stringify(job.spentResources),
  }));

  const idWidth = Math.max("Job ID".length, ...rows.map((row) => row.jobId.length));
  const blueprintWidth = Math.max("Blueprint".length, ...rows.map((row) => row.blueprintId.length));
  const outputWidth = Math.max("Output".length, ...rows.map((row) => row.output.length));
  const facilityWidth = Math.max("Facility".length, ...rows.map((row) => row.facility.length));
  const statusWidth = Math.max("Status".length, ...rows.map((row) => row.status.length));
  const ticksWidth = Math.max("Ticks Left".length, ...rows.map((row) => row.ticksLeft.length));
  const spentWidth = Math.max("Spent Resources".length, ...rows.map((row) => row.spentResources.length));

  return [
    `${padCell("Job ID", idWidth)}  ${padCell("Blueprint", blueprintWidth)}  ${padCell("Output", outputWidth)}  ${padCell("Facility", facilityWidth)}  ${padCell("Status", statusWidth)}  ${padCell("Ticks Left", ticksWidth)}  ${padCell("Spent Resources", spentWidth)}`,
    `${"-".repeat(idWidth)}  ${"-".repeat(blueprintWidth)}  ${"-".repeat(outputWidth)}  ${"-".repeat(facilityWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(ticksWidth)}  ${"-".repeat(spentWidth)}`,
    ...rows.map(
      (row) =>
        `${padCell(row.jobId, idWidth)}  ${padCell(row.blueprintId, blueprintWidth)}  ${padCell(row.output, outputWidth)}  ${padCell(row.facility, facilityWidth)}  ${padCell(row.status, statusWidth)}  ${padCell(row.ticksLeft, ticksWidth)}  ${padCell(row.spentResources, spentWidth)}`,
    ),
  ].join("\n");
}
