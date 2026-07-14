import { runNightWatchInspection } from "./night-watch";

const rootDir = new URL(".", import.meta.url);
const result = await runNightWatchInspection({
  rootDir: rootDir.pathname,
});

console.log(result.response);
