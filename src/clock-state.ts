import { readClockStateRow, writeClockStateRow } from "./sqlite-storage";

export type ClockMode = "manual" | "listening";
export type ClockStreamStatus = "disconnected" | "connecting" | "connected" | "error";

export type ClockState = {
  mode: ClockMode;
  streamStatus: ClockStreamStatus;
  lastKeplerTick: number | null;
  lastAdvancedBy: number | null;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastConnectionError: string | null;
};

export function defaultClockState(): ClockState {
  return {
    mode: "manual",
    streamStatus: "disconnected",
    lastKeplerTick: null,
    lastAdvancedBy: null,
    lastConnectedAt: null,
    lastMessageAt: null,
    lastConnectionError: null,
  };
}

export function readClockState(): ClockState {
  const row = readClockStateRow();
  if (!row) {
    return defaultClockState();
  }

  try {
    const validMode = ["manual", "listening"].includes(row.mode);
    const validStreamStatus = ["disconnected", "connecting", "connected", "error"].includes(row.stream_status);
    const validLastKeplerTick = row.last_kepler_tick === null || typeof row.last_kepler_tick === "number";

    if (!validMode || !validStreamStatus || !validLastKeplerTick) {
      return defaultClockState();
    }

    return {
      mode: row.mode as ClockMode,
      streamStatus: row.stream_status as ClockStreamStatus,
      lastKeplerTick: row.last_kepler_tick,
      lastAdvancedBy: row.last_advanced_by,
      lastConnectedAt: row.last_connected_at,
      lastMessageAt: row.last_message_at,
      lastConnectionError: row.last_connection_error,
    };
  } catch {
    return defaultClockState();
  }
}

export function writeClockState(state: ClockState): void {
  writeClockStateRow({
    mode: state.mode,
    stream_status: state.streamStatus,
    last_kepler_tick: state.lastKeplerTick,
    last_advanced_by: state.lastAdvancedBy,
    last_connected_at: state.lastConnectedAt,
    last_message_at: state.lastMessageAt,
    last_connection_error: state.lastConnectionError,
  });
}

export function normalizeClockStateForStartup(): ClockState {
  const state = readClockState();
  if (state.mode === "manual" && state.streamStatus !== "disconnected") {
    const normalized = { ...state, streamStatus: "disconnected" as const };
    writeClockState(normalized);
    return normalized;
  }
  return state;
}
