#!/usr/bin/env bun

import { runHabitat } from "./cli";

const aliasArgs = process.argv.slice(2);
const forwardedArgs =
  aliasArgs.length === 0
    ? [process.argv[0] ?? "bun", process.argv[1] ?? "battery", "battery", "--help"]
    : [process.argv[0] ?? "bun", process.argv[1] ?? "battery", "battery", ...aliasArgs];

await runHabitat(forwardedArgs);
