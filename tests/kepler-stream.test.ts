import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStateBlob, readClockStateRow, writeStateBlob } from "../src/sqlite-storage";
import { normalizeClockStateForStartup, readClockState, writeClockState } from "../src/clock-state";
import {
  getClockWatchNotices,
  isKeplerStreamActive,
  setWebSocketConstructor,
  startKeplerStream,
  stopKeplerStream,
  resetClockWatchNotices,
  setPowerTickRunnerForTests,
} from "../src/kepler-stream";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static failNext = false;
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, ((event: any) => void)[]>();

  constructor(public url: string) {
    if (FakeWebSocket.failNext) {
      FakeWebSocket.failNext = false;
      throw new Error("socket creation failed");
    }
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(value: string) { this.sent.push(value); }
  close() { this.closed = true; this.emit("close", {}); }
  emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    if (type === "open") {
      for (const listener of this.listeners.get("message") ?? []) {
        listener({ data: JSON.stringify({ type: "hello_ack", habitatId: "habitat-1" }) });
      }
    }
  }
}

let originalCwd = "";
let originalApiBase: string | undefined;
let workspaceDir = "";

beforeEach(async () => {
  originalCwd = process.cwd();
  originalApiBase = process.env.HABITAT_API_BASE_URL;
  delete process.env.HABITAT_API_BASE_URL;
  workspaceDir = await mkdtemp(join(tmpdir(), "habitat-stream-"));
  await mkdir(join(workspaceDir, ".habitat"), { recursive: true });
  process.chdir(workspaceDir);
  FakeWebSocket.instances = [];
  FakeWebSocket.failNext = false;
  resetClockWatchNotices();
  setWebSocketConstructor(FakeWebSocket as any);
  writeStateBlob("registration", JSON.stringify({
    habitatName: "Test Habitat", registeredAt: new Date().toISOString(), registrationId: "r1",
    habitatId: "habitat-1", status: "registered", registerUrl: "https://kepler.test/register",
    unregisterUrl: null, starterHumans: [], alertContract: null, streamUrl: "wss://kepler.test/stream",
    apiToken: "saved-stream-token", stream: { protocolVersion: "1", subscriptions: ["ticks"], currentTick: 10, ticksPerPulse: 5, status: "ready" }, raw: {},
  }));
  writeClockState({ ...readClockState(), mode: "listening", streamStatus: "disconnected" });
});

afterEach(async () => {
  await stopKeplerStream();
  setWebSocketConstructor(WebSocket);
  setPowerTickRunnerForTests(null);
  process.chdir(originalCwd);
  if (originalApiBase === undefined) delete process.env.HABITAT_API_BASE_URL;
  else process.env.HABITAT_API_BASE_URL = originalApiBase;
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("Kepler stream", () => {
  test("owns one authenticated connection and stops it", async () => {
    await startKeplerStream();
    await startKeplerStream();
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0].emit("open", {});
    expect(FakeWebSocket.instances[0].sent).toEqual([JSON.stringify({ type: "hello", apiToken: "saved-stream-token", subscribe: ["ticks"] })]);
    expect(isKeplerStreamActive()).toBe(true);
    await stopKeplerStream();
    expect(FakeWebSocket.instances[0].closed).toBe(true);
    expect(isKeplerStreamActive()).toBe(false);
  });

  test("shares one in-flight startup with concurrent callers", async () => {
    const starts = [startKeplerStream(), startKeplerStream(), startKeplerStream()];
    await Promise.all(starts);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test("captures tick notices locally", async () => {
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 15, advancedBy: 5, occurredAt: "2026-07-16T12:00:00.000Z" }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getClockWatchNotices()).toEqual([expect.objectContaining({ currentTick: 15, ticksApplied: 5 })]);
  });

  test("calculates each tick notice from the latest received Kepler tick", async () => {
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 15, advancedBy: 5 }) });
    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 20, advancedBy: 5 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getClockWatchNotices().map((notice) => notice.ticksApplied)).toEqual([5, 5]);
  });

  test("applies the complete advancedBy amount for 1, 10, and 100", async () => {
    const applied: number[] = [];
    setPowerTickRunnerForTests(async (count) => { applied.push(count); });
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const [tick, advancedBy] of [[11, 1], [21, 10], [121, 100]]) {
      socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick, advancedBy }) });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(applied).toEqual([1, 10, 100]);
    expect(readClockState()).toMatchObject({ lastKeplerTick: 121, lastAdvancedBy: 100 });
  });

  test("advances local simulation when a tick notice arrives", async () => {
    writeStateBlob("modules", JSON.stringify({ habitatId: "habitat-1", modules: [{
        id: "battery-1", slug: "battery-1", blueprintId: "battery", displayName: "Battery",
        connectedTo: [], capabilities: ["battery"],
        runtimeAttributes: { currentEnergyKwh: 100, energyStorageKwh: 100, powerDrawKw: 1 },
      }] }));
    writeStateBlob("simulation", JSON.stringify({ currentTick: 0 }));
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 15, advancedBy: 5 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const simulation = JSON.parse(readStateBlob("simulation") ?? "{}");
    expect(simulation.currentTick).toBe(5);
  });

  test("aborts the real simulation before a stopped stream tick persists state", async () => {
    writeStateBlob("modules", JSON.stringify({ habitatId: "habitat-1", modules: [{
      id: "battery-1", slug: "battery-1", blueprintId: "battery", displayName: "Battery",
      connectedTo: [], capabilities: ["battery"],
      runtimeAttributes: { currentEnergyKwh: 100, energyStorageKwh: 100, powerDrawKw: 1 },
    }] }));
    writeStateBlob("simulation", JSON.stringify({ currentTick: 0 }));
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 1000000, advancedBy: 1000000 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await stopKeplerStream();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(JSON.parse(readStateBlob("simulation") ?? "{}").currentTick).toBe(0);
    expect(JSON.parse(readStateBlob("modules") ?? "{}").modules[0].runtimeAttributes.currentEnergyKwh).toBe(100);
    expect(getClockWatchNotices()).toEqual([]);
  });

  test("ignores a tick after listening is switched to manual", async () => {
    writeStateBlob("simulation", JSON.stringify({ currentTick: 0 }));
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    writeClockState({ ...readClockState(), mode: "manual", streamStatus: "connected", lastKeplerTick: null });

    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 15, advancedBy: 5 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getClockWatchNotices()).toEqual([]);
    expect(JSON.parse(readStateBlob("simulation") ?? "{}").currentTick).toBe(0);
    expect(socket.closed).toBe(true);
    expect(isKeplerStreamActive()).toBe(false);
  });

  test("does not commit a tick when listening is turned off during simulation", async () => {
    let resolveTicks!: () => void;
    const ticksStarted = new Promise<void>((resolve) => { resolveTicks = resolve; });
    setPowerTickRunnerForTests(() => ticksStarted.then(() => ({}) as any));
    writeStateBlob("simulation", JSON.stringify({ currentTick: 0 }));
    await startKeplerStream();
    const socket = FakeWebSocket.instances[0];

    socket.emit("message", { data: JSON.stringify({ type: "planet_tick", tick: 15, advancedBy: 5 }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    writeClockState({ ...readClockState(), mode: "manual" });
    await stopKeplerStream();
    resolveTicks();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getClockWatchNotices()).toEqual([]);
    expect(readClockState()).toEqual(expect.objectContaining({ mode: "manual", streamStatus: "disconnected", lastKeplerTick: null }));
    expect(socket.closed).toBe(true);
  });

  test("normalizes stale connected status when persisted mode is manual", async () => {
    writeClockState({ ...readClockState(), mode: "manual", streamStatus: "connected", lastKeplerTick: null });
    await startKeplerStream();

    expect(readClockStateRow()?.stream_status).toBe("disconnected");
  });

  test("startup normalization repairs persisted manual mode before stream restoration", () => {
    writeClockState({ ...readClockState(), mode: "manual", streamStatus: "connected", lastKeplerTick: null });

    const state = normalizeClockStateForStartup();

    expect(state).toEqual(expect.objectContaining({ mode: "manual", streamStatus: "disconnected" }));
    expect(readClockStateRow()?.stream_status).toBe("disconnected");
  });

  test("releases startup ownership after socket creation fails", async () => {
    FakeWebSocket.failNext = true;
    await expect(startKeplerStream()).rejects.toThrow("socket creation failed");

    await startKeplerStream();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  test("closes the failed socket on error and ignores its stale close event after recovery", async () => {
    await startKeplerStream();
    const failedSocket = FakeWebSocket.instances[0];
    failedSocket.emit("error", new Error("connection lost"));

    expect(failedSocket.closed).toBe(true);

    await startKeplerStream();
    const replacementSocket = FakeWebSocket.instances[1];
    replacementSocket.emit("open", {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    failedSocket.emit("close", {});

    expect(isKeplerStreamActive()).toBe(true);
    expect(readClockStateRow()?.stream_status).toBe("connected");
  });
});
