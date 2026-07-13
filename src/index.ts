#!/usr/bin/env bun

import { loadProjectEnv } from "./env";

loadProjectEnv();
process.env.HABITAT_API_BASE_URL ||= "http://localhost:8787";

const { runHabitat } = await import("./cli");

await runHabitat(process.argv);

export {};
