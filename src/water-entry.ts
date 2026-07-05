#!/usr/bin/env bun

import { runHabitat } from "./cli";

const aliasArgs = process.argv.slice(2);
const forwardedArgs =
  aliasArgs.length === 0
    ? [process.argv[0] ?? "bun", process.argv[1] ?? "water", "water", "--help"]
    : [process.argv[0] ?? "bun", process.argv[1] ?? "water", "water", ...aliasArgs];

await runHabitat(forwardedArgs);
