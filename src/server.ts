import { loadProjectEnv } from "./env";
import { startHabitatApiServer } from "./server-runtime";

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

export {};
