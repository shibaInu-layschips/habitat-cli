import { readRegistration } from "./kepler-registration";
import { readClockState, writeClockState, type ClockState } from "./clock-state";
import { runPowerTicks } from "./power-simulation";

export type ClockEvent = { tick: number; advancedBy: number; issuedAt: string | null; applied: boolean };
export type ClockWatchNotice = ClockEvent & { currentTick: number; ticksApplied: number; receivedAt: string; occurredAt: string | null; type: "tick" };
type WebSocketLike = { send(data: string): void; close(): void; addEventListener(type: string, listener: (event: any) => void): void };
type WebSocketConstructor = new (url: string) => WebSocketLike;

let websocketConstructor: WebSocketConstructor = WebSocket;
let activeSocket: WebSocketLike | null = null;
let startupPromise: Promise<void> | null = null;
let notices: ClockWatchNotice[] = [];
let powerTickRunner = runPowerTicks;
let latestObservedTick: number | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let stopping = false;
const acknowledgedSockets = new WeakSet<object>();
const activeTickRuns = new Map<WebSocketLike, Set<AbortController>>();
const activeTickPromises = new Map<WebSocketLike, Set<Promise<unknown>>>();
const gracefulSockets = new WeakSet<object>();
const messageQueues = new Map<WebSocketLike, Promise<void>>();
const eventListeners = new Set<(event: ClockEvent) => void>();

export function setWebSocketConstructor(constructor: WebSocketConstructor): void { websocketConstructor = constructor; }
export function setPowerTickRunnerForTests(runner: typeof runPowerTicks | null): void { powerTickRunner = runner ?? runPowerTicks; }
export function hasCompleteKeplerStreamRegistration(
  registration: Awaited<ReturnType<typeof readRegistration>>,
): registration is NonNullable<Awaited<ReturnType<typeof readRegistration>>> & {
  streamUrl: string;
  apiToken: string;
  habitatId: string;
  stream: NonNullable<NonNullable<Awaited<ReturnType<typeof readRegistration>>>["stream"]>;
} {
  return Boolean(registration?.streamUrl && registration.apiToken && registration.habitatId && registration.stream);
}
function updateClock(update: Partial<ClockState>): void { writeClockState({ ...readClockState(), ...update }); }
function parseMessage(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") return typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
  try { const parsed = JSON.parse(data); return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null; } catch { return null; }
}

function registrationGeneration(registration: Awaited<ReturnType<typeof readRegistration>>): string {
  return JSON.stringify(registration ? {
    registrationId: registration.registrationId,
    habitatId: registration.habitatId,
    streamUrl: registration.streamUrl,
    apiToken: registration.apiToken,
    stream: registration.stream,
  } : null);
}

async function handleMessage(socket: WebSocketLike, messageEvent: { data: unknown }): Promise<void> {
  const message = parseMessage(messageEvent.data);
  if (!message) return;
  if (message.type === "hello_ack") {
    const registration = await readRegistration();
    if (!hasCompleteKeplerStreamRegistration(registration) || message.habitatId !== registration.habitatId) {
      updateClock({ streamStatus: "error", lastConnectionError: "Kepler hello_ack habitatId did not match the saved registration." });
      if (activeSocket === socket) await stopKeplerStream();
      return;
    }
    acknowledgedSockets.add(socket);
    console.log(`[kepler-stream] authenticated habitatId=${registration.habitatId}`);
    updateClock({ streamStatus: "connected", lastConnectionError: null });
    return;
  }
  if (message.type !== "planet_tick" || !acknowledgedSockets.has(socket) || typeof message.tick !== "number" || !Number.isInteger(message.tick) || typeof message.advancedBy !== "number" || !Number.isInteger(message.advancedBy) || message.advancedBy < 1) {
    if (message.type === "planet_tick") {
      updateClock({ streamStatus: "error", lastConnectionError: "Invalid Kepler planet_tick message." });
    }
    return;
  }
  const registration = await readRegistration();
  const clockState = readClockState();
  if (clockState.mode !== "listening" || !hasCompleteKeplerStreamRegistration(registration)) {
    if (activeSocket === socket) {
      abortTickRuns(socket);
      activeSocket = null;
      socket.close();
      updateClock({ streamStatus: "disconnected" });
    }
    return;
  }
  const absoluteTick = message.tick;
  const lastAcceptedTick = latestObservedTick ?? clockState.lastKeplerTick ?? registration.stream.currentTick;
  if (absoluteTick <= lastAcceptedTick) return;
  const capturedGeneration = registrationGeneration(registration);
  const capturedSocket = socket;
  const ticksApplied = message.advancedBy;
  const notice: ClockWatchNotice = {
    type: "tick",
    tick: absoluteTick,
    advancedBy: ticksApplied,
    applied: false,
    currentTick: absoluteTick,
    ticksApplied,
    receivedAt: new Date().toISOString(),
    occurredAt: typeof message.issuedAt === "string" ? message.issuedAt : null,
    issuedAt: typeof message.issuedAt === "string" ? message.issuedAt : null,
  };
  const controller = new AbortController();
  const socketRuns = activeTickRuns.get(socket) ?? new Set<AbortController>();
  socketRuns.add(controller);
  activeTickRuns.set(socket, socketRuns);
  let tickError = false;
  const tickPromise = powerTickRunner(ticksApplied, controller.signal);
  const socketPromises = activeTickPromises.get(socket) ?? new Set<Promise<unknown>>();
  socketPromises.add(tickPromise);
  activeTickPromises.set(socket, socketPromises);
  try { await tickPromise; } catch { tickError = true; }
  finally {
    socketPromises.delete(tickPromise);
    if (socketPromises.size === 0) activeTickPromises.delete(socket);
    socketRuns.delete(controller);
    if (socketRuns.size === 0) activeTickRuns.delete(socket);
  }
  const currentRegistration = await readRegistration();
  const currentClock = readClockState();
  if (
    currentClock.mode !== "listening" ||
    !hasCompleteKeplerStreamRegistration(currentRegistration) ||
    registrationGeneration(currentRegistration) !== capturedGeneration ||
    activeSocket !== capturedSocket
  ) {
    if (activeSocket === capturedSocket) {
      activeSocket = null;
      capturedSocket.close();
      updateClock({ streamStatus: "disconnected" });
    } else {
      capturedSocket.close();
    }
    return;
  }
  notices = [...notices, notice].slice(-100);
  updateClock({
    lastKeplerTick: notice.currentTick,
    lastAdvancedBy: tickError ? null : notice.ticksApplied,
    lastMessageAt: notice.receivedAt,
    lastConnectionError: tickError ? "Unable to apply Kepler tick." : null,
    streamStatus: tickError ? "error" : "connected",
  });
  latestObservedTick = absoluteTick;
  const clockEvent: ClockEvent = { tick: notice.currentTick, advancedBy: notice.ticksApplied, issuedAt: notice.issuedAt, applied: !tickError };
  notice.applied = !tickError;
  console.log(`[kepler-stream] planet_tick tick=${clockEvent.tick} advancedBy=${clockEvent.advancedBy} applied=${clockEvent.applied ? "yes" : "no"}`);
  for (const listener of eventListeners) listener(clockEvent);
}

export function subscribeClockEvents(listener: (event: ClockEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export async function startKeplerStream(): Promise<void> {
  stopping = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (activeSocket) return;
  if (startupPromise) return startupPromise;
  startupPromise = (async () => {
    const persistedClock = readClockState();
    if (persistedClock.mode === "manual") {
      updateClock({ streamStatus: "disconnected" });
      return;
    }
    const registration = await readRegistration();
    if (!hasCompleteKeplerStreamRegistration(registration)) {
      updateClock({ streamStatus: "error" });
      throw new Error("Saved registration does not contain complete Kepler stream details.");
    }
    updateClock({ streamStatus: "connecting" });
    if (!registration.stream.subscriptions.includes("ticks")) {
      updateClock({ streamStatus: "error", lastConnectionError: "Kepler registration does not advertise tick subscriptions." });
      throw new Error("Kepler registration does not advertise tick subscriptions.");
    }
    const socket = new websocketConstructor(registration.streamUrl);
    activeSocket = socket;
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "hello", apiToken: registration.apiToken, subscribe: ["ticks"] }));
      const connectedAt = new Date().toISOString();
      console.log(`[kepler-stream] connected streamUrl=${registration.streamUrl}`);
      updateClock({ streamStatus: "connecting", lastConnectedAt: connectedAt, lastConnectionError: null });
    });
    socket.addEventListener("message", (event) => {
      const previous = messageQueues.get(socket) ?? Promise.resolve();
      const next = previous.then(() => handleMessage(socket, event)).catch(() => undefined);
      messageQueues.set(socket, next);
      void next.finally(() => { if (messageQueues.get(socket) === next) messageQueues.delete(socket); });
    });
    socket.addEventListener("close", () => {
      if (!gracefulSockets.has(socket)) abortTickRuns(socket);
      if (activeSocket !== socket) return;
      activeSocket = null;
      updateClock({ streamStatus: "disconnected" });
      if (!stopping) scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      if (!gracefulSockets.has(socket)) abortTickRuns(socket);
      if (activeSocket !== socket) return;
      socket.close();
      activeSocket = null;
      updateClock({ streamStatus: "error", lastConnectionError: "Kepler WebSocket connection failed." });
      if (!stopping) scheduleReconnect();
    });
  })().finally(() => { startupPromise = null; });
  return startupPromise;
}
function scheduleReconnect(): void {
  if (reconnectTimer || stopping || readClockState().mode !== "listening") return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startKeplerStream().catch(() => undefined);
  }, 1000);
}
function abortTickRuns(socket: WebSocketLike): void {
  for (const controller of activeTickRuns.get(socket) ?? []) controller.abort();
  activeTickRuns.delete(socket);
}

export async function stopKeplerStream(options: { finishTicks?: boolean } = {}): Promise<void> {
  stopping = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  const socket = activeSocket;
  activeSocket = null;
  if (socket) {
    if (options.finishTicks) {
      gracefulSockets.add(socket);
    } else {
      abortTickRuns(socket);
    }
    socket.close();
    if (options.finishTicks) {
      await Promise.all(activeTickPromises.get(socket) ?? []);
      gracefulSockets.delete(socket);
    }
  }
  updateClock({ streamStatus: "disconnected" });
}
export function getClockWatchNotices(): ClockWatchNotice[] { return notices.map((notice) => ({ ...notice })); }
export function isKeplerStreamActive(): boolean { return activeSocket !== null; }
export function resetClockWatchNotices(): void { notices = []; latestObservedTick = null; }
