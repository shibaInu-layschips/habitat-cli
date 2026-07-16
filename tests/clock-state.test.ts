import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readClockState, writeClockState, type ClockState } from "../src/clock-state";

let originalCwd = "";
let workspaceDir = "";

beforeEach(async () => {
  originalCwd = process.cwd();
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-clock-state-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("clock state", () => {
  test("persists and reloads a non-default state", () => {
    const state: ClockState = {
      mode: "listening",
      streamStatus: "connected",
      lastKeplerTick: 42,
      lastAdvancedBy: 1,
      lastConnectedAt: "2026-07-16T12:34:50.000Z",
      lastMessageAt: "2026-07-16T12:34:56.000Z",
      lastConnectionError: null,
    };

    writeClockState(state);

    expect(readClockState()).toEqual(state);
  });
});
