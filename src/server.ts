import { loadProjectEnv } from "./env";
import { startHabitatApiServer } from "./server-runtime";
import { normalizeClockStateForStartup } from "./clock-state";
import { startKeplerStream, stopKeplerStream } from "./kepler-stream";

loadProjectEnv();
process.env.HABITAT_BACKEND_RUNTIME = "1";

const [{ app }, { resolveApiHost, resolveApiPort }] = await Promise.all([
  import("./state-api"),
  import("./server-config"),
]);

const hostname = resolveApiHost();
const port = resolveApiPort();
const server = startHabitatApiServer(app.fetch, hostname, port);

console.log(`Habitat state API listening on http://${hostname}:${server.port ?? port}`);

if (normalizeClockStateForStartup().mode === "listening") {
  void startKeplerStream().catch((error) => {
    console.error(`Unable to restore Kepler clock stream: ${error instanceof Error ? error.message : String(error)}`);
  });
}

const stopStreamOnExit = () => { void stopKeplerStream(); };
process.once("SIGTERM", stopStreamOnExit);
process.once("SIGINT", stopStreamOnExit);
process.once("beforeExit", stopStreamOnExit);

export {};
